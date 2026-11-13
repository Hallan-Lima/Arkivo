import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { SettingsService } from '../settings/settings.service';
import { toMarkdown } from '../nodes/to-markdown';
import { chunkMarkdown } from './chunker';
import { buildEmbeddingModel, embedTexts, toVectorLiteral } from './embeddings';

const TICK_MS = 4000;
const NODES_PER_TICK = 15;
const EMBED_BATCH = 48;
const BACKOFF_MS = 60_000;

/**
 * Indexador em segundo plano.
 * 1. Documentos editados (updated_at > indexed_at) são quebrados em trechos de novo.
 * 2. Trechos sem embedding (ou com embedding de outro modelo) recebem o vetor do modelo atual.
 * Falha no provedor de embeddings não bloqueia nada: os trechos ficam só com busca por palavras
 * e o indexador tenta de novo depois.
 */
@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Indexador');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private embedFailures = new Map<string, number>();

  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap() {
    this.schedule(1500);
  }

  onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Pede uma rodada logo (ex.: depois de salvar um documento). */
  kick() {
    this.schedule(300);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick() {
    if (this.running) return this.schedule(TICK_MS);
    this.running = true;
    let busy = false;
    try {
      busy = (await this.reindexChanged()) > 0;
      busy = (await this.embedMissing()) > 0 || busy;
    } catch (e) {
      this.log.warn(`Falha na indexação: ${(e as Error).message}`);
    } finally {
      this.running = false;
      this.schedule(busy ? 200 : TICK_MS);
    }
  }

  private async reindexChanged() {
    const nodes = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select(['nodes.id', 'nodes.title', 'nodes.content', 'spaces.workspace_id'])
      // Como texto: o Postgres guarda microssegundos e o Date do JS só milissegundos.
      .select(sql<string>`nodes.updated_at::text`.as('updated_at'))
      .where((eb) => eb.or([eb('nodes.indexed_at', 'is', null), eb('nodes.indexed_at', '<', eb.ref('nodes.updated_at'))]))
      .orderBy('nodes.updated_at')
      .limit(NODES_PER_TICK)
      .execute();

    for (const node of nodes) {
      const { v } = await this.db
        .selectFrom('node_versions')
        .select(sql<number>`coalesce(max(version), 0)::int`.as('v'))
        .where('node_id', '=', node.id)
        .executeTakeFirstOrThrow();
      const chunks = chunkMarkdown(toMarkdown(node.content));
      await this.db.transaction().execute(async (trx) => {
        await trx.deleteFrom('node_chunks').where('node_id', '=', node.id).execute();
        if (chunks.length) {
          await trx
            .insertInto('node_chunks')
            .values(chunks.map((c) => ({ node_id: node.id, workspace_id: node.workspace_id, idx: c.idx, heading: c.heading, content: c.content, version: v })))
            .execute();
        }
        // Grava o updated_at lido: se alguém editou no meio do caminho, o documento volta para a fila.
        await sql`UPDATE nodes SET indexed_at = ${node.updated_at}::timestamptz WHERE id = ${node.id}`.execute(trx);
      });
    }
    return nodes.length;
  }

  private async embedMissing() {
    const workspaces = await this.db.selectFrom('workspaces').select('id').execute();
    let done = 0;
    for (const { id: workspaceId } of workspaces) {
      const failedAt = this.embedFailures.get(workspaceId);
      if (failedAt && Date.now() - failedAt < BACKOFF_MS) continue;
      const s = await this.settings.getAi(workspaceId);
      const em = buildEmbeddingModel(s);
      if (!em) continue;

      const rows = await this.db
        .selectFrom('node_chunks')
        .innerJoin('nodes', 'nodes.id', 'node_chunks.node_id')
        .select(['node_chunks.id', 'node_chunks.heading', 'node_chunks.content', 'nodes.title'])
        .where('node_chunks.workspace_id', '=', workspaceId)
        .where((eb) => eb.or([eb('node_chunks.embedding', 'is', null), eb('node_chunks.embedding_model', 'is distinct from', em.id)]))
        .limit(EMBED_BATCH)
        .execute();
      if (!rows.length) continue;

      try {
        const vectors = await embedTexts(
          em.model,
          rows.map((r) => [r.title, r.heading, r.content].filter(Boolean).join('\n')),
        );
        for (let i = 0; i < rows.length; i++) {
          await sql`UPDATE node_chunks SET embedding = ${toVectorLiteral(vectors[i])}::vector, embedding_model = ${em.id} WHERE id = ${rows[i].id}`.execute(this.db);
        }
        this.embedFailures.delete(workspaceId);
        done += rows.length;
      } catch (e) {
        this.embedFailures.set(workspaceId, Date.now());
        this.log.warn(`Embeddings indisponíveis (${em.id}): ${(e as Error).message}. Nova tentativa em 1 min; a busca por palavras continua funcionando.`);
      }
    }
    return done;
  }

  /** Situação da indexação, mostrada na administração e no notebook. */
  async status(workspaceId: string) {
    const s = await this.settings.getAi(workspaceId);
    const em = buildEmbeddingModel(s);
    const row = await sql<{ docs: number; pending: number; chunks: number; embedded: number }>`
      SELECT
        (SELECT count(*)::int FROM nodes n JOIN spaces sp ON sp.id = n.space_id WHERE sp.workspace_id = ${workspaceId}) AS docs,
        (SELECT count(*)::int FROM nodes n JOIN spaces sp ON sp.id = n.space_id
          WHERE sp.workspace_id = ${workspaceId} AND (n.indexed_at IS NULL OR n.indexed_at < n.updated_at)) AS pending,
        (SELECT count(*)::int FROM node_chunks WHERE workspace_id = ${workspaceId}) AS chunks,
        (SELECT count(*)::int FROM node_chunks WHERE workspace_id = ${workspaceId} AND embedding_model = ${em?.id ?? ''}) AS embedded
    `.execute(this.db);
    const failedAt = this.embedFailures.get(workspaceId);
    return {
      ...row.rows[0],
      semantic: !!em,
      embeddingModel: em?.id ?? null,
      embeddingError: failedAt && Date.now() - failedAt < BACKOFF_MS ? 'O provedor de embeddings falhou recentemente; tentando de novo em instantes.' : null,
    };
  }
}
