import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { ChangeRequestSource, DB } from '../database/types';
import { toMarkdown } from '../nodes/to-markdown';

@Injectable()
export class ChangeRequestsService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  async create(
    workspaceId: string,
    input: { nodeId: string; summary: string; instruction?: string; markdown: string; title?: string; source: ChangeRequestSource; authorId?: string; authorLabel?: string },
  ) {
    const node = await this.assertNode(workspaceId, input.nodeId);
    const { v } = await this.db
      .selectFrom('node_versions')
      .select(sql<number>`coalesce(max(version), 0)::int`.as('v'))
      .where('node_id', '=', node.id)
      .executeTakeFirstOrThrow();
    return this.db
      .insertInto('change_requests')
      .values({
        node_id: node.id,
        base_version: v,
        summary: input.summary,
        instruction: input.instruction ?? null,
        proposed_title: input.title ?? null,
        proposed_markdown: input.markdown,
        source: input.source,
        author_id: input.authorId ?? null,
        author_label: input.authorLabel ?? null,
      })
      .returning(['id', 'summary', 'source', 'status', 'created_at'])
      .executeTakeFirstOrThrow();
  }

  async listForNode(workspaceId: string, nodeId: string) {
    await this.assertNode(workspaceId, nodeId);
    return this.db
      .selectFrom('change_requests')
      .leftJoin('users as author', 'author.id', 'change_requests.author_id')
      .leftJoin('users as resolver', 'resolver.id', 'change_requests.resolved_by')
      .select([
        'change_requests.id',
        'change_requests.summary',
        'change_requests.source',
        'change_requests.status',
        'change_requests.author_label',
        'change_requests.created_at',
        'change_requests.resolved_at',
        'author.name as author_name',
        'resolver.name as resolver_name',
      ])
      .where('change_requests.node_id', '=', nodeId)
      .orderBy('change_requests.created_at', 'desc')
      .limit(50)
      .execute();
  }

  /** Propostas abertas do workspace inteiro (painel "Revisões pendentes"). */
  listOpen(workspaceId: string) {
    return this.db
      .selectFrom('change_requests')
      .innerJoin('nodes', 'nodes.id', 'change_requests.node_id')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select([
        'change_requests.id',
        'change_requests.summary',
        'change_requests.source',
        'change_requests.author_label',
        'change_requests.created_at',
        'nodes.id as node_id',
        'nodes.title as node_title',
        'spaces.slug as space_slug',
        'spaces.name as space_name',
      ])
      .where('spaces.workspace_id', '=', workspaceId)
      .where('change_requests.status', '=', 'open')
      .orderBy('change_requests.created_at', 'desc')
      .execute();
  }

  async get(workspaceId: string, id: string) {
    const cr = await this.db
      .selectFrom('change_requests')
      .innerJoin('nodes', 'nodes.id', 'change_requests.node_id')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .leftJoin('users as author', 'author.id', 'change_requests.author_id')
      .selectAll('change_requests')
      .select(['nodes.title as node_title', 'nodes.content as node_content', 'author.name as author_name'])
      .select((eb) =>
        eb.selectFrom('node_versions').whereRef('node_versions.node_id', '=', 'nodes.id').select(sql<number>`coalesce(max(version), 0)::int`.as('v')).as('current_version'),
      )
      .where('change_requests.id', '=', id)
      .where('spaces.workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!cr) throw new NotFoundException('Proposta não encontrada');
    const { node_content, ...rest } = cr;
    return { ...rest, current_markdown: toMarkdown(node_content) };
  }

  /** Marca a proposta como resolvida. O conteúdo aceito é aplicado pelo NodesService. */
  async resolve(workspaceId: string, id: string, userId: string, status: 'accepted' | 'rejected') {
    const cr = await this.get(workspaceId, id);
    if (cr.status !== 'open') throw new BadRequestException('Esta proposta já foi resolvida');
    await this.db
      .updateTable('change_requests')
      .set({ status, resolved_by: userId, resolved_at: new Date() })
      .where('id', '=', id)
      .execute();
    return cr;
  }

  private async assertNode(workspaceId: string, nodeId: string) {
    const node = await this.db
      .selectFrom('nodes')
      .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
      .select(['nodes.id'])
      .where('nodes.id', '=', nodeId)
      .where('spaces.workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!node) throw new NotFoundException('Documento não encontrado');
    return node;
  }
}
