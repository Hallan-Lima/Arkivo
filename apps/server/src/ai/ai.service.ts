import { BadRequestException, Injectable } from '@nestjs/common';
import { generateText, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Kysely } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { SettingsService, type AiSettings } from '../settings/settings.service';
import { toMarkdown } from '../nodes/to-markdown';

const BASE_INSTRUCTIONS = `Você é o assistente de documentação do Arkivo, a base de conhecimento da empresa.
Responda em português do Brasil, de forma clara e objetiva, usando Markdown.
Baseie-se SOMENTE nos documentos fornecidos no contexto. Se a informação não estiver neles, diga que não encontrou na documentação.`;

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

  instructions(s: AiSettings, extra?: string) {
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

  /** Pede à IA uma nova versão do documento conforme a instrução. Retorna Markdown. */
  async propose(workspaceId: string, nodeId: string, instruction: string, references?: string) {
    const { model, settings } = await this.model(workspaceId);
    if (!settings.allowProposals) throw new BadRequestException('Propostas da IA estão desativadas pelo administrador');
    const node = await this.loadNode(workspaceId, nodeId);
    const { text } = await generateText({
      model,
      instructions: this.instructions(
        settings,
        `Sua tarefa agora é EDITAR um documento. Devolva o documento COMPLETO já alterado, em Markdown (GFM), sem comentários antes ou depois e sem cercar a resposta com \`\`\`.
Preserve o conteúdo que não precisa mudar. Não invente fatos técnicos (IPs, senhas, nomes de servidores) que não estejam no texto ou na instrução.
Na PRIMEIRA linha escreva "RESUMO: " seguido de uma frase curta descrevendo a alteração; depois uma linha em branco; depois o documento.${references ? `

Use as FONTES DE REFERÊNCIA abaixo (outros documentos da empresa) para corrigir ou completar o documento. Não copie números de citação para o texto.

# Fontes de referência

${references}` : ""}`,
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
