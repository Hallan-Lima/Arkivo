import { BadRequestException, Injectable } from '@nestjs/common';
import { generateText, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Kysely, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { SettingsService, type AiSettings } from '../settings/settings.service';
import { toMarkdown } from '../nodes/to-markdown';

export interface Source {
  id: string;
  title: string;
  space_slug: string;
  space_name: string;
}

const BASE_INSTRUCTIONS = `Você é o assistente de documentação do Arkivo, a base de conhecimento da empresa.
Responda em português do Brasil, de forma clara e objetiva, usando Markdown.
Baseie-se SOMENTE nos documentos fornecidos no contexto. Se a informação não estiver neles, diga que não encontrou na documentação.
Ao usar um documento, cite-o pelo título entre colchetes, ex.: [Backup do banco].`;

@Injectable()
export class AiService {
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly settings: SettingsService,
  ) {}

  static buildModel(s: AiSettings & { apiKey: string }): LanguageModel {
    const baseURL = s.baseUrl?.trim() || undefined;
    switch (s.provider) {
      case 'openai':
        return createOpenAI({ apiKey: s.apiKey, baseURL })(s.model);
      case 'anthropic':
        return createAnthropic({ apiKey: s.apiKey, baseURL })(s.model);
      case 'ollama':
        return createOpenAICompatible({ name: 'ollama', baseURL: baseURL ?? 'http://localhost:11434/v1', apiKey: s.apiKey || undefined })(s.model);
      case 'openai-compatible':
        if (!baseURL) throw new BadRequestException('Informe a URL base do provedor');
        return createOpenAICompatible({ name: 'custom', baseURL, apiKey: s.apiKey || undefined })(s.model);
    }
  }

  async model(workspaceId: string) {
    const s = await this.settings.getAi(workspaceId);
    if (!s.enabled || !s.model) throw new BadRequestException('A IA não está habilitada. Um administrador pode configurá-la em Administração → Inteligência Artificial.');
    return { model: AiService.buildModel(s), settings: s };
  }

  private instructions(s: AiSettings, extra?: string) {
    return [BASE_INSTRUCTIONS, s.instructions?.trim() && `Instruções da empresa:\n${s.instructions.trim()}`, extra].filter(Boolean).join('\n\n');
  }

  /** Testa a configuração (sem salvar) com uma chamada curta. */
  async test(s: AiSettings & { apiKey: string }) {
    const started = Date.now();
    const { text } = await generateText({
      model: AiService.buildModel(s),
      prompt: 'Responda apenas com a palavra: OK',
      maxOutputTokens: 20,
    });
    return { ok: true, reply: text.trim().slice(0, 100), ms: Date.now() - started };
  }

  /** Busca documentos relevantes (full-text) para usar como contexto. */
  async retrieve(workspaceId: string, query: string, limit = 5, excludeId?: string) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter((t) => t.length > 2)
      .slice(0, 12);
    if (!terms.length) return [];
    const tsquery = terms.map((t) => `${t}:*`).join(' | ');
    const { rows } = await sql<Source & { content: unknown }>`
      SELECT n.id, n.title, n.content, s.slug AS space_slug, s.name AS space_name
      FROM nodes n JOIN spaces s ON s.id = n.space_id
      WHERE s.workspace_id = ${workspaceId}
        AND n.search @@ to_tsquery('simple', ${tsquery})
        AND (${excludeId ?? null}::uuid IS NULL OR n.id <> ${excludeId ?? null}::uuid)
      ORDER BY ts_rank(n.search, to_tsquery('simple', ${tsquery})) DESC
      LIMIT ${limit}
    `.execute(this.db);
    return rows.map((r) => ({ ...r, markdown: toMarkdown(r.content).slice(0, 6000) }));
  }

  async loadNode(workspaceId: string, nodeId: string) {
    const node = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select(['nodes.id', 'nodes.title', 'nodes.content', 'spaces.slug as space_slug', 'spaces.name as space_name'])
      .where('nodes.id', '=', nodeId)
      .where('spaces.workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!node) throw new BadRequestException('Documento não encontrado');
    return { ...node, markdown: toMarkdown(node.content) };
  }

  /** Chat com streaming. Se `nodeId` vier, o documento atual entra como contexto principal. */
  async chat(workspaceId: string, messages: ModelMessage[], nodeId?: string) {
    const { model, settings } = await this.model(workspaceId);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const question = typeof lastUser?.content === 'string' ? lastUser.content : '';

    const current = nodeId ? await this.loadNode(workspaceId, nodeId) : null;
    const related = await this.retrieve(workspaceId, `${question} ${current?.title ?? ''}`, current ? 3 : 6, current?.id);
    const sources: Source[] = [...(current ? [current] : []), ...related].map(({ id, title, space_slug, space_name }) => ({ id, title, space_slug, space_name }));

    const context = [
      current && `## Documento aberto pelo usuário: ${current.title || 'Sem título'}\n\n${current.markdown.slice(0, 20000)}`,
      ...related.map((r) => `## Documento: ${r.title || 'Sem título'} (espaço ${r.space_name})\n\n${r.markdown}`),
    ]
      .filter(Boolean)
      .join('\n\n---\n\n');

    const result = streamText({
      model,
      instructions: this.instructions(settings, `# Contexto (documentação da empresa)\n\n${context || '(nenhum documento relevante encontrado)'}`),
      messages: messages.slice(-12),
      maxOutputTokens: 2000,
    });
    return { stream: result.textStream, sources };
  }

  /** Pede à IA uma nova versão do documento conforme a instrução. Retorna Markdown. */
  async propose(workspaceId: string, nodeId: string, instruction: string) {
    const { model, settings } = await this.model(workspaceId);
    if (!settings.allowProposals) throw new BadRequestException('Propostas da IA estão desativadas pelo administrador');
    const node = await this.loadNode(workspaceId, nodeId);
    const { text } = await generateText({
      model,
      instructions: this.instructions(
        settings,
        `Sua tarefa agora é EDITAR um documento. Devolva o documento COMPLETO já alterado, em Markdown (GFM), sem comentários antes ou depois e sem cercar a resposta com \`\`\`.
Preserve o conteúdo que não precisa mudar. Não invente fatos técnicos (IPs, senhas, nomes de servidores) que não estejam no texto ou na instrução.
Na PRIMEIRA linha escreva "RESUMO: " seguido de uma frase curta descrevendo a alteração; depois uma linha em branco; depois o documento.`,
      ),
      prompt: `Instrução: ${instruction}\n\nTítulo atual: ${node.title || 'Sem título'}\n\nDocumento atual:\n\n${node.markdown || '(vazio)'}`,
      maxOutputTokens: 8000,
    });
    let body = text.trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/m, '$1');
    let summary = instruction.slice(0, 140);
    const m = body.match(/^RESUMO:\s*(.+)\n+/);
    if (m) {
      summary = m[1].trim().slice(0, 200);
      body = body.slice(m[0].length);
    }
    return { summary, markdown: body.trim(), baseMarkdown: node.markdown };
  }
}
