import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, Transaction, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { AiUsage, DB, NodeStatus, NodeType } from '../database/types';
import type { AuthUser } from '../auth/public.decorator';
import { extractText } from './text-content';
import { SettingsService } from '../settings/settings.service';

/** Edições do mesmo autor dentro desta janela são agrupadas na mesma versão. */
const VERSION_COALESCE_MS = 10 * 60 * 1000;

export interface UpdateNodeInput {
  title?: string;
  icon?: string | null;
  content?: unknown;
  status?: NodeStatus;
  ownerId?: string | null;
  reviewDueAt?: string | null;
  aiUsage?: AiUsage;
  designId?: string | null;
}

@Injectable()
export class NodesService {
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly settings: SettingsService,
  ) {}

  /** Lista plana da árvore de um espaço; o cliente monta a hierarquia. */
  async tree(user: AuthUser, spaceId: string) {
    await this.assertSpace(user, spaceId);
    return this.db
      .selectFrom('nodes')
      .select(['id', 'parent_id', 'type', 'title', 'icon', 'position', 'status', 'ai_usage'])
      .where('space_id', '=', spaceId)
      .orderBy('position')
      .orderBy('created_at')
      .execute();
  }

  async get(user: AuthUser, id: string) {
    const node = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .leftJoin('users as owner', 'owner.id', 'nodes.owner_id')
      .leftJoin('users as editor', 'editor.id', 'nodes.updated_by')
      .select([
        'nodes.id',
        'nodes.space_id',
        'nodes.parent_id',
        'nodes.type',
        'nodes.title',
        'nodes.icon',
        'nodes.content',
        'nodes.status',
        'nodes.owner_id',
        'nodes.review_due_at',
        'nodes.ai_usage',
        'nodes.design_id',
        'nodes.created_at',
        'nodes.updated_at',
        'spaces.slug as space_slug',
        'spaces.name as space_name',
        'owner.name as owner_name',
        'editor.name as updated_by_name',
      ])
      .select((eb) =>
        eb.selectFrom('node_versions').whereRef('node_versions.node_id', '=', 'nodes.id').select(sql<number>`coalesce(max(version), 0)::int`.as('v')).as('version'),
      )
      .select((eb) =>
        eb
          .selectFrom('change_requests')
          .whereRef('change_requests.node_id', '=', 'nodes.id')
          .where('change_requests.status', '=', 'open')
          .select(sql<number>`count(*)::int`.as('c'))
          .as('open_proposals'),
      )
      .where('nodes.id', '=', id)
      .where('spaces.workspace_id', '=', user.workspaceId)
      .executeTakeFirst();
    if (!node) throw new NotFoundException('Documento não encontrado');
    const files = await this.db
      .selectFrom('files')
      .select(['id', 'name', 'kind', 'mime', 'size', 'preview_file_id', 'created_at'])
      .where('node_id', '=', id)
      .where('kind', 'not in', ['image', 'preview'])
      .orderBy('created_at')
      .execute();
    // De quais documentos este foi gerado (notebook/Estúdio) e se essas fontes mudaram depois.
    const derived_from = await this.db
      .selectFrom('node_sources')
      .innerJoin('nodes as src', 'src.id', 'node_sources.source_node_id')
      .innerJoin('spaces as ss', 'ss.id', 'src.space_id')
      .select(['src.id', 'src.title', 'ss.slug as space_slug', 'node_sources.source_version'])
      .select((eb) =>
        eb.selectFrom('node_versions').whereRef('node_versions.node_id', '=', 'src.id').select(sql<number>`coalesce(max(version), 0)::int`.as('v')).as('current_version'),
      )
      .where('node_sources.node_id', '=', id)
      .execute();
    return { ...node, files, derived_from };
  }

  async create(
    user: AuthUser,
    input: {
      spaceId: string;
      parentId?: string | null;
      title?: string;
      type?: NodeType;
      content?: unknown;
      status?: NodeStatus;
      sourceFileId?: string;
      designId?: string | null;
      /** Documentos usados como fonte (Estúdio do notebook). */
      derivedFrom?: string[];
    },
  ) {
    await this.assertSpace(user, input.spaceId);
    if (input.parentId) {
      const parent = await this.assertNode(user, input.parentId);
      if (parent.space_id !== input.spaceId) throw new BadRequestException('O pai pertence a outro espaço');
    }

    return this.db.transaction().execute(async (trx) => {
      const { max } = await trx
        .selectFrom('nodes')
        .select(sql<number>`coalesce(max(position), 0)`.as('max'))
        .where('space_id', '=', input.spaceId)
        .where((eb) => (input.parentId ? eb('parent_id', '=', input.parentId) : eb('parent_id', 'is', null)))
        .executeTakeFirstOrThrow();

      const doc = input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] };
      const { defaultReviewDays } = await this.settings.get(user.workspaceId, 'general');
      const node = await trx
        .insertInto('nodes')
        .values({
          space_id: input.spaceId,
          parent_id: input.parentId ?? null,
          type: input.type ?? 'page',
          title: input.title ?? '',
          content: JSON.stringify(doc),
          text_content: extractText(doc),
          ...(input.status ? { status: input.status } : {}),
          design_id: input.designId ? await this.assertDesign(user, input.designId) : null,
          position: Number(max) + 1,
          owner_id: user.id,
          review_due_at: defaultReviewDays > 0 ? new Date(Date.now() + defaultReviewDays * 86400_000) : null,
          created_by: user.id,
          updated_by: user.id,
        })
        .returning(['id', 'parent_id', 'type', 'title', 'icon', 'position', 'status'])
        .executeTakeFirstOrThrow();

      if (input.sourceFileId) {
        await trx
          .updateTable('files')
          .set({ node_id: node.id })
          .where('id', '=', input.sourceFileId)
          .where('workspace_id', '=', user.workspaceId)
          .execute();
      }
      if (input.derivedFrom?.length) await this.recordSources(trx, user, node.id, input.derivedFrom);
      await this.snapshot(trx, node.id, user.id, {
        force: true,
        message: input.sourceFileId ? 'Importado' : input.derivedFrom?.length ? 'Gerado pelo notebook de IA' : 'Criado',
      });
      return node;
    });
  }

  async update(user: AuthUser, id: string, input: UpdateNodeInput) {
    await this.assertNode(user, id);
    return this.db.transaction().execute(async (trx) => {
      const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: user.id };
      if (input.title !== undefined) patch.title = input.title;
      if (input.icon !== undefined) patch.icon = input.icon;
      if (input.status !== undefined) patch.status = input.status;
      if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
      if (input.reviewDueAt !== undefined) patch.review_due_at = input.reviewDueAt;
      if (input.aiUsage !== undefined) patch.ai_usage = input.aiUsage;
      if (input.designId !== undefined) patch.design_id = input.designId ? await this.assertDesign(user, input.designId) : null;
      if (input.content !== undefined) {
        patch.content = JSON.stringify(input.content);
        patch.text_content = extractText(input.content);
      }
      await trx.updateTable('nodes').set(patch).where('id', '=', id).execute();

      if (input.title !== undefined || input.content !== undefined) {
        await this.snapshot(trx, id, user.id, {});
      }
      return { ok: true };
    });
  }

  async move(user: AuthUser, id: string, input: { parentId: string | null; position: number }) {
    const node = await this.assertNode(user, id);
    if (input.parentId) {
      const parent = await this.assertNode(user, input.parentId);
      if (parent.space_id !== node.space_id) throw new BadRequestException('Não é possível mover entre espaços (ainda)');
      // Impede mover um item para dentro dele mesmo ou de um descendente.
      const cycle = await sql<{ id: string }>`
        WITH RECURSIVE anc AS (
          SELECT id, parent_id FROM nodes WHERE id = ${input.parentId}
          UNION ALL
          SELECT n.id, n.parent_id FROM nodes n JOIN anc ON n.id = anc.parent_id
        ) SELECT id FROM anc WHERE id = ${id} LIMIT 1
      `.execute(this.db);
      if (cycle.rows.length) throw new BadRequestException('Não é possível mover para dentro de si mesmo');
    }
    await this.db
      .updateTable('nodes')
      .set({ parent_id: input.parentId, position: input.position, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  }

  async remove(user: AuthUser, id: string) {
    await this.assertNode(user, id);
    await this.db.deleteFrom('nodes').where('id', '=', id).execute();
    return { ok: true };
  }

  /** Documentos cuja data de revisão já passou. */
  reviewQueue(user: AuthUser) {
    return this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .leftJoin('users as owner', 'owner.id', 'nodes.owner_id')
      .select(['nodes.id', 'nodes.title', 'nodes.status', 'nodes.review_due_at', 'owner.name as owner_name', 'spaces.slug as space_slug', 'spaces.name as space_name'])
      .where('spaces.workspace_id', '=', user.workspaceId)
      .where('nodes.review_due_at', '<', new Date())
      .orderBy('nodes.review_due_at')
      .limit(200)
      .execute();
  }

  // ---------- Versões ----------

  async versions(user: AuthUser, id: string) {
    await this.assertNode(user, id);
    return this.db
      .selectFrom('node_versions')
      .leftJoin('users', 'users.id', 'node_versions.created_by')
      .select([
        'node_versions.version',
        'node_versions.title',
        'node_versions.message',
        'node_versions.created_at',
        'node_versions.updated_at',
        'users.name as author_name',
      ])
      .where('node_versions.node_id', '=', id)
      .orderBy('node_versions.version', 'desc')
      .execute();
  }

  async version(user: AuthUser, id: string, version: number) {
    await this.assertNode(user, id);
    const row = await this.db
      .selectFrom('node_versions')
      .leftJoin('users', 'users.id', 'node_versions.created_by')
      .select([
        'node_versions.version',
        'node_versions.title',
        'node_versions.content',
        'node_versions.text_content',
        'node_versions.message',
        'node_versions.created_at',
        'users.name as author_name',
      ])
      .where('node_versions.node_id', '=', id)
      .where('node_versions.version', '=', version)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Versão não encontrada');
    return row;
  }

  async checkpoint(user: AuthUser, id: string, message: string) {
    await this.assertNode(user, id);
    return this.db.transaction().execute((trx) => this.snapshot(trx, id, user.id, { force: true, message }));
  }

  async restore(user: AuthUser, id: string, version: number) {
    const v = await this.version(user, id, version);
    return this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('nodes')
        .set({
          title: v.title,
          content: JSON.stringify(v.content),
          text_content: v.text_content,
          updated_at: new Date(),
          updated_by: user.id,
        })
        .where('id', '=', id)
        .execute();
      return this.snapshot(trx, id, user.id, { force: true, message: `Restaurado da versão ${version}` });
    });
  }

  /**
   * Grava o estado atual do nó como versão.
   * Sem `force`, edições consecutivas do mesmo autor em até 10 min atualizam a última versão
   * (evita criar uma versão a cada autosave).
   */
  private async snapshot(trx: Transaction<DB>, nodeId: string, userId: string, opts: { force?: boolean; message?: string }) {
    const node = await trx.selectFrom('nodes').select(['title', 'content', 'text_content']).where('id', '=', nodeId).executeTakeFirstOrThrow();
    const latest = await trx
      .selectFrom('node_versions')
      .select(['id', 'version', 'created_by', 'created_at', 'message'])
      .where('node_id', '=', nodeId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();

    const values = { title: node.title, content: JSON.stringify(node.content), text_content: node.text_content };

    const canCoalesce =
      !opts.force &&
      latest &&
      !latest.message &&
      latest.created_by === userId &&
      Date.now() - new Date(latest.created_at).getTime() < VERSION_COALESCE_MS;

    if (canCoalesce) {
      await trx.updateTable('node_versions').set({ ...values, updated_at: new Date() }).where('id', '=', latest!.id).execute();
      return { version: latest!.version };
    }

    const version = (latest?.version ?? 0) + 1;
    await trx
      .insertInto('node_versions')
      .values({ node_id: nodeId, version, ...values, message: opts.message ?? null, created_by: userId })
      .execute();
    return { version };
  }

  /** Registra as fontes (e as versões atuais delas) de um documento gerado a partir de outros. */
  private async recordSources(trx: Transaction<DB>, user: AuthUser, nodeId: string, sourceIds: string[]) {
    const rows = await trx
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select('nodes.id')
      .select((eb) =>
        eb.selectFrom('node_versions').whereRef('node_versions.node_id', '=', 'nodes.id').select(sql<number>`coalesce(max(version), 0)::int`.as('v')).as('version'),
      )
      .where('nodes.id', 'in', [...new Set(sourceIds)].slice(0, 100))
      .where('spaces.workspace_id', '=', user.workspaceId)
      .execute();
    const values = rows.filter((r) => r.id !== nodeId).map((r) => ({ node_id: nodeId, source_node_id: r.id, source_version: Number(r.version ?? 0) }));
    if (values.length) await trx.insertInto('node_sources').values(values).onConflict((oc) => oc.doNothing()).execute();
  }

  /** Marca as fontes como "conferidas" na versão atual (depois de atualizar o documento derivado). */
  async refreshSources(user: AuthUser, id: string) {
    await this.assertNode(user, id);
    await sql`
      UPDATE node_sources ns SET source_version = (SELECT coalesce(max(v.version), 0) FROM node_versions v WHERE v.node_id = ns.source_node_id)
      WHERE ns.node_id = ${id}
    `.execute(this.db);
    return { ok: true };
  }

  private async assertDesign(user: AuthUser, designId: string) {
    const d = await this.db.selectFrom('doc_designs').select('id').where('id', '=', designId).where('workspace_id', '=', user.workspaceId).executeTakeFirst();
    if (!d) throw new BadRequestException('Design não encontrado');
    return d.id;
  }

  // ---------- Escopo ----------

  private async assertSpace(user: AuthUser, spaceId: string) {
    const space = await this.db.selectFrom('spaces').select('id').where('id', '=', spaceId).where('workspace_id', '=', user.workspaceId).executeTakeFirst();
    if (!space) throw new NotFoundException('Espaço não encontrado');
  }

  private async assertNode(user: AuthUser, id: string) {
    const node = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select(['nodes.id', 'nodes.space_id'])
      .where('nodes.id', '=', id)
      .where('spaces.workspace_id', '=', user.workspaceId)
      .executeTakeFirst();
    if (!node) throw new NotFoundException('Documento não encontrado');
    return node;
  }
}
