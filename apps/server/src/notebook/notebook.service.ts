import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateText, streamText, type ModelMessage } from 'ai';
import { Kysely, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { AiService } from '../ai/ai.service';
import { RetrievalService, type Scope } from './retrieval.service';

const CITATION_RULES = `# Como usar as fontes
- Cada fonte do contexto começa com um número entre colchetes, ex.: [3].
- Ao usar uma informação, cite o número logo depois da frase, ex.: "O backup roda às 2h [3]." Pode citar várias: [1][4].
- Use SOMENTE números que existem no contexto. Nunca invente fontes.
- Se a resposta não estiver nas fontes, diga claramente que não encontrou na documentação.
- Se duas fontes se contradizem, aponte a contradição, diga qual parece mais confiável (fonte de referência, versão mais recente, status) e que a outra pode estar desatualizada.`;

export type StudioKind = 'summary' | 'briefing' | 'faq' | 'study_guide' | 'timeline' | 'mindmap' | 'report' | 'new_doc';

const STUDIO: Record<StudioKind, { label: string; query: string; task: string; cite: boolean }> = {
  summary: {
    label: 'Resumo',
    query: 'visão geral objetivo principais pontos',
    task: 'Escreva um RESUMO das fontes: um parágrafo de visão geral e depois os pontos principais em tópicos. Cite as fontes.',
    cite: true,
  },
  briefing: {
    label: 'Briefing',
    query: 'principais temas decisões riscos responsabilidades',
    task: 'Escreva um DOCUMENTO DE BRIEFING para alguém que precisa entender o assunto rápido: contexto, principais temas, decisões/regras importantes, riscos e pontos de atenção. Use seções com títulos. Cite as fontes.',
    cite: true,
  },
  faq: {
    label: 'Perguntas frequentes',
    query: 'como fazer quando quem prazo procedimento',
    task: 'Crie um FAQ com 8 a 12 perguntas que as pessoas realmente fariam sobre estas fontes, cada uma com resposta objetiva. Formato: "### Pergunta" seguido da resposta. Cite as fontes.',
    cite: true,
  },
  study_guide: {
    label: 'Guia de estudo',
    query: 'conceitos definições passos importantes',
    task: 'Crie um GUIA DE ESTUDO: conceitos-chave com definição curta, um questionário de 5 a 8 perguntas e, no final, o gabarito. Cite as fontes.',
    cite: true,
  },
  timeline: {
    label: 'Linha do tempo',
    query: 'data prazo vigência ano versão histórico',
    task: 'Monte uma LINHA DO TEMPO com os eventos, datas, prazos e mudanças encontrados nas fontes, em ordem cronológica (lista com a data em negrito). Se não houver datas suficientes, diga isso. Cite as fontes.',
    cite: true,
  },
  mindmap: {
    label: 'Mapa mental',
    query: 'temas tópicos estrutura',
    task: 'Crie um MAPA MENTAL das fontes como lista Markdown aninhada (tema central no primeiro nível, depois subtemas, até 3 níveis). Itens curtos, sem parágrafos e sem citações.',
    cite: false,
  },
  report: {
    label: 'Relatório',
    query: '',
    task: 'Escreva um RELATÓRIO conforme o pedido do usuário, com seções e títulos claros. Cite as fontes.',
    cite: true,
  },
  new_doc: {
    label: 'Novo documento',
    query: '',
    task: `Escreva um NOVO DOCUMENTO para a base de conhecimento, conforme o pedido do usuário, usando as fontes como base.
Escreva o documento final, pronto para publicar: seções com títulos, listas e tabelas quando ajudarem.
NÃO coloque números de citação no texto. Não invente fatos técnicos (IPs, senhas, nomes, valores) que não estejam nas fontes; quando faltar informação, deixe um marcador "⚠️ A confirmar: ...".`,
    cite: false,
  },
};

export interface AuditFinding {
  id: string;
  type: 'contradiction' | 'source_changed' | 'review_overdue' | 'stale' | 'marked_outdated';
  severity: 'high' | 'medium' | 'low';
  nodeId: string;
  title: string;
  spaceSlug: string;
  detail: string;
  suggestion?: string;
  related?: { nodeId: string; title: string; spaceSlug: string };
}

@Injectable()
export class NotebookService {
  private readonly log = new Logger('Notebook');
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly ai: AiService,
    private readonly retrieval: RetrievalService,
  ) {}

  /** Chat com as fontes selecionadas, com citações numeradas. */
  async chat(workspaceId: string, messages: ModelMessage[], scope: Scope, nodeId?: string) {
    const { model, settings } = await this.ai.model(workspaceId);
    const userTexts = messages.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : ''));
    // A pergunta atual + a anterior ajudam em perguntas de acompanhamento ("e no caso de X?").
    const query = userTexts.slice(-2).join(' ');
    const { sources, context, mode } = await this.retrieval.retrieve(workspaceId, query, scope, { pinned: nodeId ? [nodeId] : [] });

    const extra = [
      CITATION_RULES,
      nodeId && 'A fonte [1] é o documento que o usuário está vendo agora; trate-o como assunto principal.',
      `# Fontes\n\n${context || '(nenhuma fonte encontrada para esta pergunta)'}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = streamText({
      model,
      instructions: this.ai.instructions(settings, extra),
      messages: messages.slice(-12),
      maxOutputTokens: 3000,
    });
    return { stream: result.textStream, sources, mode };
  }

  /** Estúdio: gera um conteúdo (resumo, FAQ, novo documento…) a partir das fontes. */
  async studio(workspaceId: string, input: { kind: StudioKind; scope: Scope; nodeId?: string; instruction?: string; guidelines?: string }) {
    const def = STUDIO[input.kind];
    if ((input.kind === 'report' || input.kind === 'new_doc') && !input.instruction?.trim()) {
      throw new BadRequestException('Descreva o que deve ser gerado');
    }
    const { model, settings } = await this.ai.model(workspaceId);
    const query = [input.instruction, def.query].filter(Boolean).join(' ');
    const { sources, context } = await this.retrieval.retrieve(workspaceId, query, input.scope, {
      pinned: input.nodeId ? [input.nodeId] : [],
      limit: 16,
    });
    if (!sources.length) throw new BadRequestException('Nenhuma fonte disponível. Marque documentos na árvore ou ajuste a seleção.');

    const extra = [
      def.cite ? CITATION_RULES : 'As fontes estão numeradas no contexto, mas NÃO use números de citação nesta tarefa.',
      `# Tarefa\n${def.task}\nResponda em Markdown. Na PRIMEIRA linha escreva "TÍTULO: " e um título curto; depois uma linha em branco; depois o conteúdo (sem repetir o título como cabeçalho).`,
      input.guidelines?.trim() && `# Padrão visual e de conteúdo da empresa para este documento\n${input.guidelines.trim()}`,
      `# Fontes\n\n${context}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { text } = await generateText({
      model,
      instructions: this.ai.instructions(settings, extra),
      prompt: input.instruction?.trim() ? `Pedido: ${input.instruction.trim()}` : `Gere: ${def.label}`,
      maxOutputTokens: 8000,
    });
    let body = text.trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/m, '$1');
    let title = def.label;
    const m = body.match(/^\s*(?:\*\*)?T[IÍ]TULO:?\*?\*?\s*(.+)\n+/i);
    if (m) {
      title = m[1].replace(/\*+/g, '').trim().slice(0, 200);
      body = body.slice(m[0].length);
    }
    return { kind: input.kind, label: def.label, title, markdown: body.trim(), sources };
  }

  /** Atualizar um documento usando outras fontes como referência. Gera texto para uma proposta (diff). */
  async proposeWithSources(workspaceId: string, nodeId: string, instruction: string, scope: Scope, referenceNodeIds: string[] = []) {
    const node = await this.ai.loadNode(workspaceId, nodeId);
    const { sources, context } = await this.retrieval.retrieve(workspaceId, `${instruction} ${node.title}`, scope, {
      pinned: referenceNodeIds.filter((id) => id !== nodeId),
      exclude: [nodeId],
      limit: 8,
    });
    const result = await this.ai.propose(workspaceId, nodeId, instruction, context || undefined);
    return { ...result, sources };
  }

  /**
   * "O que está desatualizado?"
   * Sinais baratos (sempre): revisão vencida, sem edição há muito tempo, já marcado como desatualizado,
   * documento gerado a partir de fontes que mudaram depois.
   * Sinal caro (deep): a IA compara cada documento com trechos parecidos de outros documentos e aponta contradições.
   */
  async audit(workspaceId: string, scope: Scope, opts: { deep: boolean; maxDocs: number }) {
    const { meta, allowed } = await this.retrieval.resolveScope(workspaceId, scope);
    const inScope = (id: string) => meta.has(id) && meta.get(id)!.ai_usage !== 'never' && (!allowed || allowed.has(id));
    const findings: AuditFinding[] = [];
    const info = (id: string) => ({ nodeId: id, title: meta.get(id)?.title || 'Sem título', spaceSlug: meta.get(id)?.space_slug ?? '' });

    const rows = await sql<{ id: string; review_due_at: Date | null; updated_at: Date; status: string }>`
      SELECT n.id, n.review_due_at, n.updated_at, n.status
      FROM nodes n JOIN spaces s ON s.id = n.space_id
      WHERE s.workspace_id = ${workspaceId}
    `.execute(this.db);
    const now = Date.now();
    for (const r of rows.rows) {
      if (!inScope(r.id)) continue;
      if (r.status === 'outdated') {
        findings.push({ id: `outdated:${r.id}`, type: 'marked_outdated', severity: 'medium', ...info(r.id), detail: 'O documento já está marcado como desatualizado e precisa ser revisado ou arquivado.' });
      } else if (r.review_due_at && new Date(r.review_due_at).getTime() < now) {
        const days = Math.floor((now - new Date(r.review_due_at).getTime()) / 86400_000);
        findings.push({ id: `review:${r.id}`, type: 'review_overdue', severity: days > 90 ? 'medium' : 'low', ...info(r.id), detail: `A data de revisão venceu há ${days} dia(s).` });
      }
      const age = Math.floor((now - new Date(r.updated_at).getTime()) / 86400_000);
      if (age > 365) {
        findings.push({ id: `stale:${r.id}`, type: 'stale', severity: 'low', ...info(r.id), detail: `Sem nenhuma edição há ${age} dias.` });
      }
    }

    // Documentos gerados a partir de fontes que ganharam versões novas.
    const changed = await sql<{ node_id: string; source_node_id: string; source_version: number; current: number }>`
      SELECT ns.node_id, ns.source_node_id, ns.source_version,
             (SELECT coalesce(max(v.version), 0)::int FROM node_versions v WHERE v.node_id = ns.source_node_id) AS current
      FROM node_sources ns
      JOIN nodes n ON n.id = ns.node_id JOIN spaces s ON s.id = n.space_id
      WHERE s.workspace_id = ${workspaceId}
    `.execute(this.db);
    for (const c of changed.rows) {
      if (!inScope(c.node_id) || c.current <= c.source_version) continue;
      findings.push({
        id: `source:${c.node_id}:${c.source_node_id}`,
        type: 'source_changed',
        severity: 'high',
        ...info(c.node_id),
        detail: `Foi criado a partir de "${meta.get(c.source_node_id)?.title || 'Sem título'}" (versão ${c.source_version}), que já está na versão ${c.current}.`,
        suggestion: 'Atualize este documento com base na versão nova da fonte.',
        related: info(c.source_node_id),
      });
    }

    let checked = 0;
    // A contra B e B contra A são a mesma contradição: guarda o par já reportado.
    const seenPairs = new Set<string>();
    if (opts.deep) {
      const { model, settings } = await this.ai.model(workspaceId);
      const candidates = rows.rows
        .filter((r) => inScope(r.id))
        .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
        .slice(0, opts.maxDocs);
      for (const doc of candidates) {
        const loaded = await this.retrieval.loadDoc(doc.id);
        if (!loaded?.markdown.trim()) continue;
        const title = meta.get(doc.id)?.title ?? '';
        const { sources, context } = await this.retrieval.retrieve(workspaceId, `${title} ${loaded.markdown.slice(0, 600)}`, scope, { exclude: [doc.id], limit: 6 });
        if (!sources.length) continue;
        checked++;
        try {
          const issues = await this.compare(model, settings, title, new Date(doc.updated_at), loaded.markdown, context);
          for (const [i, issue] of issues.entries()) {
            const src = sources.find((s) => s.n === issue.source);
            if (src) {
              const pair = [doc.id, src.nodeId].sort().join(':');
              if (seenPairs.has(pair)) continue;
              seenPairs.add(pair);
            }
            const otherIsOld = issue.outdated === 'source' && src;
            const target = otherIsOld ? src!.nodeId : doc.id;
            findings.push({
              id: `contradiction:${doc.id}:${i}`,
              type: 'contradiction',
              severity: issue.outdated === 'unclear' ? 'medium' : 'high',
              ...info(target),
              detail: `${issue.claim} — ${issue.explanation}`,
              suggestion: issue.suggestion,
              related: otherIsOld ? info(doc.id) : src ? info(src.nodeId) : undefined,
            });
          }
        } catch (e) {
          this.log.warn(`Auditoria de "${title}" falhou: ${(e as Error).message}`);
        }
      }
    }

    const order = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    return { findings, checkedDocs: checked, deep: opts.deep, scopeDocs: allowed ? allowed.size : [...meta.values()].filter((m) => m.ai_usage !== 'never').length };
  }

  private async compare(model: Awaited<ReturnType<AiService['model']>>['model'], settings: Awaited<ReturnType<AiService['model']>>['settings'], title: string, updatedAt: Date, markdown: string, context: string) {
    const { text } = await generateText({
      model,
      instructions: this.ai.instructions(
        settings,
        `Você é um auditor de documentação. Compare o DOCUMENTO com as FONTES numeradas e encontre apenas CONTRADIÇÕES REAIS de fato
(valores, nomes, horários, procedimentos, regras, versões de sistemas) — não aponte diferenças de estilo nem informações complementares.
Responda SOMENTE com JSON, sem texto antes ou depois, no formato:
{"issues":[{"claim":"o que o documento diz","source":3,"explanation":"o que a fonte [3] diz de diferente","outdated":"doc|source|unclear","suggestion":"como corrigir"}]}
"outdated" indica quem provavelmente está desatualizado (use datas, versões, status e "fonte de referência" para decidir). Sem contradições: {"issues":[]}.`,
      ),
      prompt: `# DOCUMENTO: ${title || 'Sem título'} (última edição ${updatedAt.toISOString().slice(0, 10)})\n\n${markdown.slice(0, 12000)}\n\n# FONTES\n\n${context}`,
      maxOutputTokens: 2000,
    });
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return [];
    const parsed = JSON.parse(json) as { issues?: { claim: string; source: number; explanation: string; outdated: 'doc' | 'source' | 'unclear'; suggestion?: string }[] };
    return (parsed.issues ?? []).filter((i) => i && i.claim && i.explanation).slice(0, 5);
  }

}
