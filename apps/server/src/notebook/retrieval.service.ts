import { Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { AiUsage, DB, NodeStatus } from '../database/types';
import { SettingsService } from '../settings/settings.service';
import { toMarkdown } from '../nodes/to-markdown';
import { buildEmbeddingModel, embedTexts, toVectorLiteral } from './embeddings';

/**
 * Seleção de fontes feita na árvore (como as caixinhas do NotebookLM).
 * Cada chave é o id de um espaço ou documento; o valor diz se entra (true) ou não (false).
 * Vale a marcação mais próxima subindo na árvore: documento → pais → espaço. Sem marcação = entra.
 */
export const scopeSchema = z
  .object({
    spaces: z.record(z.string().uuid(), z.boolean()).default({}),
    nodes: z.record(z.string().uuid(), z.boolean()).default({}),
  })
  .default({ spaces: {}, nodes: {} });
export type Scope = z.infer<typeof scopeSchema>;

export interface SourceRef {
  /** Número usado na citação: [1], [2]… */
  n: number;
  nodeId: string;
  title: string;
  spaceSlug: string;
  spaceName: string;
  heading: string | null;
  excerpt: string;
  version: number;
  status: NodeStatus;
  aiUsage: AiUsage;
  /** doc = documento inteiro no contexto; chunk = trecho encontrado pela busca. */
  kind: 'doc' | 'chunk';
}

interface Candidate {
  id: string;
  node_id: string;
  heading: string | null;
  content: string;
  version: number;
}

interface NodeMeta {
  id: string;
  parent_id: string | null;
  space_id: string;
  title: string;
  status: NodeStatus;
  ai_usage: AiUsage;
  space_slug: string;
  space_name: string;
}

/** Abaixo deste tamanho, as fontes selecionadas entram inteiras (melhor que buscar trechos). */
const FULL_CONTEXT_CHARS = 60_000;
const FULL_CONTEXT_DOCS = 20;
const PER_DOC_CAP = 3;

@Injectable()
export class RetrievalService {
  private readonly log = new Logger('Busca');
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly settings: SettingsService,
  ) {}

  private async nodesMeta(workspaceId: string): Promise<Map<string, NodeMeta>> {
    const rows = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select(['nodes.id', 'nodes.parent_id', 'nodes.space_id', 'nodes.title', 'nodes.status', 'nodes.ai_usage', 'spaces.slug as space_slug', 'spaces.name as space_name'])
      .where('spaces.workspace_id', '=', workspaceId)
      .execute();
    return new Map(rows.map((r) => [r.id, r as NodeMeta]));
  }

  /**
   * Resolve a seleção em uma lista de documentos permitidos.
   * `allowed = null` significa "todos" (exceto os marcados como "nunca usar").
   */
  async resolveScope(workspaceId: string, scope: Scope) {
    const meta = await this.nodesMeta(workspaceId);
    const hasOverrides = Object.keys(scope.spaces).length > 0 || Object.keys(scope.nodes).length > 0;
    const included = (id: string): boolean => {
      let cur = meta.get(id);
      while (cur) {
        if (cur.id in scope.nodes) return scope.nodes[cur.id];
        cur = cur.parent_id ? meta.get(cur.parent_id) : undefined;
      }
      const node = meta.get(id);
      return node ? (scope.spaces[node.space_id] ?? true) : false;
    };
    const usable = [...meta.values()].filter((n) => n.ai_usage !== 'never');
    const allowedIds = hasOverrides ? usable.filter((n) => included(n.id)).map((n) => n.id) : null;
    return {
      meta,
      allowed: allowedIds ? new Set(allowedIds) : null,
      included: allowedIds ? allowedIds.length : usable.length,
      total: meta.size,
      blocked: meta.size - usable.length,
    };
  }

  async scopeSummary(workspaceId: string, scope: Scope) {
    const { included, total, blocked } = await this.resolveScope(workspaceId, scope);
    return { included, total, blocked };
  }

  /**
   * Busca as fontes para uma pergunta.
   * - Poucas fontes selecionadas (cabem no contexto): entram inteiras, como no NotebookLM.
   * - Caso contrário: busca híbrida (palavras + significado) nos trechos, fundida por RRF.
   * `pinned` = documentos que entram inteiros de qualquer forma (ex.: o documento aberto).
   */
  async retrieve(workspaceId: string, query: string, scope: Scope, opts: { limit?: number; pinned?: string[]; exclude?: string[] } = {}) {
    const s = await this.settings.getAi(workspaceId);
    const limit = opts.limit ?? s.retrievalChunks ?? 10;
    const { meta, allowed } = await this.resolveScope(workspaceId, scope);
    const exclude = new Set(opts.exclude ?? []);
    const pinned = (opts.pinned ?? []).filter((id) => meta.has(id) && meta.get(id)!.ai_usage !== 'never');
    const sources: SourceRef[] = [];
    const contexts: string[] = [];

    const pushDoc = async (id: string, maxChars: number) => {
      const doc = await this.loadDoc(id);
      if (!doc) return;
      const m = meta.get(id)!;
      const n = sources.length + 1;
      sources.push(this.ref(n, m, null, doc.markdown, doc.version, 'doc'));
      contexts.push(this.block(n, m, null, doc.version, doc.markdown.slice(0, maxChars)));
    };

    for (const id of pinned) await pushDoc(id, 40_000);

    // Modo "fontes inteiras": seleção pequena o bastante.
    if (allowed && allowed.size > 0 && allowed.size <= FULL_CONTEXT_DOCS) {
      const ids = [...allowed].filter((id) => !pinned.includes(id) && !exclude.has(id));
      const sizes = await this.db
        .selectFrom('nodes')
        .select(['id', sql<number>`coalesce(length(text_content), 0)::int`.as('len')])
        .where('id', 'in', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        .execute();
      const totalChars = sizes.reduce((a, r) => a + r.len, 0);
      if (totalChars <= FULL_CONTEXT_CHARS) {
        for (const id of this.sortByUsage(ids, meta)) await pushDoc(id, FULL_CONTEXT_CHARS);
        return { sources, context: contexts.join('\n\n---\n\n'), mode: 'full' as const };
      }
    }
    if (allowed && allowed.size === 0) {
      return { sources, context: contexts.join('\n\n---\n\n'), mode: 'empty' as const };
    }

    const skip = new Set([...pinned, ...exclude]);
    const candidates = await this.hybrid(workspaceId, query, allowed, skip, s);
    const perDoc = new Map<string, number>();
    for (const c of candidates) {
      if (sources.length - pinned.length >= limit) break;
      const count = perDoc.get(c.node_id) ?? 0;
      if (count >= PER_DOC_CAP) continue;
      perDoc.set(c.node_id, count + 1);
      const m = meta.get(c.node_id)!;
      const n = sources.length + 1;
      sources.push(this.ref(n, m, c.heading, c.content, c.version, 'chunk'));
      contexts.push(this.block(n, m, c.heading, c.version, c.content));
    }
    return { sources, context: contexts.join('\n\n---\n\n'), mode: 'search' as const };
  }

  /** Busca híbrida: full-text (Postgres) + vetorial (pgvector), fundidas por Reciprocal Rank Fusion. */
  private async hybrid(workspaceId: string, query: string, allowed: Set<string> | null, skip: Set<string>, s: Awaited<ReturnType<SettingsService['getAi']>>) {
    const allowedArr = allowed ? [...allowed] : null;
    const skipArr = [...skip];
    const filter = sql`
      c.workspace_id = ${workspaceId}
      AND n.ai_usage <> 'never'
      AND (${allowedArr === null} OR c.node_id = ANY(${allowedArr ?? []}::uuid[]))
      AND NOT (c.node_id = ANY(${skipArr}::uuid[]))
    `;
    const lists: { rows: (Candidate & { ai_usage: AiUsage; status: NodeStatus })[] }[] = [];

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter((t) => t.length > 2)
      .slice(0, 16);
    if (terms.length) {
      const tsquery = terms.map((t) => `${t}:*`).join(' | ');
      lists.push(
        await sql<Candidate & { ai_usage: AiUsage; status: NodeStatus }>`
          SELECT c.id, c.node_id, c.heading, c.content, c.version, n.ai_usage, n.status
          FROM node_chunks c JOIN nodes n ON n.id = c.node_id
          WHERE ${filter}
            AND (c.search @@ to_tsquery('simple', ${tsquery}) OR to_tsvector('simple', n.title) @@ to_tsquery('simple', ${tsquery}))
          ORDER BY ts_rank(c.search, to_tsquery('simple', ${tsquery}))
                 + CASE WHEN to_tsvector('simple', n.title) @@ to_tsquery('simple', ${tsquery}) THEN 0.2 ELSE 0 END DESC
          LIMIT 40
        `.execute(this.db),
      );
    }

    const em = buildEmbeddingModel(s);
    if (em && query.trim()) {
      try {
        const [vec] = await embedTexts(em.model, [query.slice(0, 4000)]);
        lists.push(
          await sql<Candidate & { ai_usage: AiUsage; status: NodeStatus }>`
            SELECT c.id, c.node_id, c.heading, c.content, c.version, n.ai_usage, n.status
            FROM node_chunks c JOIN nodes n ON n.id = c.node_id
            WHERE ${filter} AND c.embedding_model = ${em.id}
            ORDER BY c.embedding <=> ${toVectorLiteral(vec)}::vector
            LIMIT 40
          `.execute(this.db),
        );
      } catch (e) {
        this.log.warn(`Busca semântica indisponível, usando só palavras: ${(e as Error).message}`);
      }
    }

    // Reciprocal Rank Fusion + ajustes: fonte de referência sobe, documento desatualizado desce.
    const scores = new Map<string, { c: Candidate; score: number }>();
    for (const list of lists) {
      list.rows.forEach((r, i) => {
        const prev = scores.get(r.id);
        const boost = r.ai_usage === 'always' ? 1.35 : r.status === 'outdated' ? 0.7 : 1;
        const add = (1 / (60 + i + 1)) * boost;
        scores.set(r.id, { c: r, score: (prev?.score ?? 0) + add });
      });
    }
    return [...scores.values()].sort((a, b) => b.score - a.score).map((x) => x.c);
  }

  async loadDoc(id: string) {
    const row = await this.db
      .selectFrom('nodes')
      .select(['content'])
      .select((eb) =>
        eb.selectFrom('node_versions').whereRef('node_versions.node_id', '=', 'nodes.id').select(sql<number>`coalesce(max(version), 0)::int`.as('v')).as('version'),
      )
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return { markdown: toMarkdown(row.content), version: Number(row.version ?? 0) };
  }

  private sortByUsage(ids: string[], meta: Map<string, NodeMeta>) {
    const rank = (id: string) => (meta.get(id)?.ai_usage === 'always' ? 0 : meta.get(id)?.status === 'outdated' ? 2 : 1);
    return [...ids].sort((a, b) => rank(a) - rank(b));
  }

  private ref(n: number, m: NodeMeta, heading: string | null, content: string, version: number, kind: 'doc' | 'chunk'): SourceRef {
    return {
      n,
      nodeId: m.id,
      title: m.title || 'Sem título',
      spaceSlug: m.space_slug,
      spaceName: m.space_name,
      heading,
      excerpt: content.replace(/\s+/g, ' ').trim().slice(0, 320),
      version,
      status: m.status,
      aiUsage: m.ai_usage,
      kind,
    };
  }

  private block(n: number, m: NodeMeta, heading: string | null, version: number, content: string) {
    const tags = [
      `espaço ${m.space_name}`,
      `versão ${version}`,
      m.ai_usage === 'always' && 'FONTE DE REFERÊNCIA (priorize)',
      m.status === 'outdated' && 'MARCADO COMO DESATUALIZADO (não trate como verdade atual)',
      m.status === 'draft' && 'rascunho',
    ]
      .filter(Boolean)
      .join(' · ');
    return `[${n}] ${m.title || 'Sem título'}${heading ? ` › ${heading}` : ''} (${tags})\n\n${content}`;
  }
}
