import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InjectDb } from '../database/database.module';
import type { DB, UserRole } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { randomToken, sha256 } from '../common/crypto';
import { AuthUser, CurrentUser, MinRole, Public, ROLE_RANK } from '../auth/public.decorator';
import { NodesService } from '../nodes/nodes.service';
import { NodesModule } from '../nodes/nodes.module';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { toMarkdown } from '../nodes/to-markdown';

const createTokenSchema = z.object({ name: z.string().trim().min(1).max(100), canWrite: z.boolean().default(false) });

@Injectable()
export class ApiTokensService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  list(workspaceId: string) {
    return this.db
      .selectFrom('api_tokens')
      .innerJoin('users', 'users.id', 'api_tokens.user_id')
      .select(['api_tokens.id', 'api_tokens.name', 'api_tokens.prefix', 'api_tokens.can_write', 'api_tokens.last_used_at', 'api_tokens.created_at', 'users.name as user_name'])
      .where('api_tokens.workspace_id', '=', workspaceId)
      .where('api_tokens.revoked_at', 'is', null)
      .orderBy('api_tokens.created_at', 'desc')
      .execute();
  }

  async create(user: AuthUser, name: string, canWrite: boolean) {
    const token = `ark_${randomToken(24)}`;
    const row = await this.db
      .insertInto('api_tokens')
      .values({ workspace_id: user.workspaceId, user_id: user.id, name, prefix: token.slice(0, 12), token_hash: sha256(token), can_write: canWrite })
      .returning(['id', 'name', 'prefix', 'can_write', 'created_at'])
      .executeTakeFirstOrThrow();
    // O token completo só é mostrado uma vez.
    return { ...row, token };
  }

  async revoke(workspaceId: string, id: string) {
    await this.db.updateTable('api_tokens').set({ revoked_at: new Date() }).where('id', '=', id).where('workspace_id', '=', workspaceId).execute();
    return { ok: true };
  }

  async authenticate(header: string | undefined) {
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return null;
    const row = await this.db
      .selectFrom('api_tokens')
      .innerJoin('users', 'users.id', 'api_tokens.user_id')
      .select(['api_tokens.id', 'api_tokens.can_write', 'users.id as user_id', 'users.workspace_id', 'users.name', 'users.email', 'users.role', 'users.active'])
      .where('api_tokens.token_hash', '=', sha256(token))
      .where('api_tokens.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row || !row.active) return null;
    await this.db.updateTable('api_tokens').set({ last_used_at: new Date() }).where('id', '=', row.id).execute();
    const user: AuthUser = { id: row.user_id, workspaceId: row.workspace_id, name: row.name, email: row.email, role: row.role as UserRole };
    return { user, canWrite: row.can_write && ROLE_RANK[user.role] >= ROLE_RANK.editor, tokenName: row.id };
  }
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

@Controller()
export class McpController {
  private readonly log = new Logger('MCP');
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly nodes: NodesService,
    private readonly crs: ChangeRequestsService,
    @InjectDb() private readonly db: Kysely<DB>,
  ) {}

  // ---------- Administração dos tokens ----------
  @Get('admin/api-tokens')
  @MinRole('admin')
  list(@CurrentUser() user: AuthUser) {
    return this.tokens.list(user.workspaceId);
  }

  @Post('admin/api-tokens')
  @MinRole('admin')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createTokenSchema)) body: z.infer<typeof createTokenSchema>) {
    return this.tokens.create(user, body.name, body.canWrite);
  }

  @Delete('admin/api-tokens/:id')
  @MinRole('admin')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tokens.revoke(user.workspaceId, id);
  }

  // ---------- Endpoint MCP (Streamable HTTP, sem sessão) ----------
  @Public()
  @Post('mcp')
  @HttpCode(200)
  async mcp(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const auth = await this.tokens.authenticate(req.headers.authorization);
    if (!auth) {
      res.status(401).header('WWW-Authenticate', 'Bearer').send({ jsonrpc: '2.0', error: { code: -32001, message: 'Token de API inválido' }, id: null });
      return;
    }
    const server = this.buildServer(auth.user, auth.canWrite);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    res.hijack();
    await transport.handleRequest(req.raw, res.raw, req.body);
  }

  @Public()
  @Get('mcp')
  mcpGet(@Res() res: FastifyReply) {
    res.status(405).header('Allow', 'POST').send({ error: 'Use POST (MCP Streamable HTTP sem sessão).' });
  }

  private buildServer(user: AuthUser, canWrite: boolean) {
    const server = new McpServer({ name: 'arkivo', version: '0.2.0' });

    server.registerTool(
      'list_spaces',
      { title: 'Listar espaços', description: 'Lista os espaços (áreas) de documentação da empresa.' },
      async () => {
        const spaces = await this.db
          .selectFrom('spaces')
          .select(['name', 'slug', 'description'])
          .where('workspace_id', '=', user.workspaceId)
          .orderBy('name')
          .execute();
        return text(spaces.map((s) => `- ${s.name} (slug: ${s.slug})${s.description ? ` — ${s.description}` : ''}`).join('\n') || 'Nenhum espaço.');
      },
    );

    server.registerTool(
      'list_pages',
      { title: 'Listar páginas', description: 'Lista as páginas de um espaço, com hierarquia.', inputSchema: { space_slug: z.string() } },
      async ({ space_slug }) => {
        const rows = await this.db
          .selectFrom('nodes')
          .innerJoin('spaces', 'spaces.id', 'nodes.space_id')
          .select(['nodes.id', 'nodes.parent_id', 'nodes.title', 'nodes.status', 'nodes.position'])
          .where('spaces.workspace_id', '=', user.workspaceId)
          .where('spaces.slug', '=', space_slug)
          .orderBy('nodes.position')
          .execute();
        const render = (parent: string | null, depth: number): string[] =>
          rows
            .filter((r) => r.parent_id === parent)
            .flatMap((r) => [`${'  '.repeat(depth)}- ${r.title || 'Sem título'} [id: ${r.id}] (${r.status})`, ...render(r.id, depth + 1)]);
        return text(render(null, 0).join('\n') || 'Espaço vazio ou inexistente.');
      },
    );

    server.registerTool(
      'search_docs',
      { title: 'Buscar documentação', description: 'Busca por palavras-chave em títulos e conteúdos.', inputSchema: { query: z.string().min(2) } },
      async ({ query }) => {
        const terms = query.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).slice(0, 8);
        if (!terms.length) return text('Consulta vazia.');
        const tsq = terms.map((t) => `${t}:*`).join(' & ');
        const { rows } = await sql<{ id: string; title: string; space: string; snippet: string }>`
          SELECT n.id, n.title, s.name AS space,
                 ts_headline('simple', coalesce(n.text_content,''), to_tsquery('simple', ${tsq}), 'MaxWords=30, MinWords=10, StartSel=**, StopSel=**') AS snippet
          FROM nodes n JOIN spaces s ON s.id = n.space_id
          WHERE s.workspace_id = ${user.workspaceId} AND n.search @@ to_tsquery('simple', ${tsq})
          ORDER BY ts_rank(n.search, to_tsquery('simple', ${tsq})) DESC LIMIT 10`.execute(this.db);
        return text(rows.map((r) => `### ${r.title || 'Sem título'}\nid: ${r.id} · espaço: ${r.space}\n${r.snippet}`).join('\n\n') || 'Nada encontrado.');
      },
    );

    server.registerTool(
      'read_page',
      { title: 'Ler página', description: 'Retorna o conteúdo de uma página em Markdown, com status e responsável.', inputSchema: { page_id: z.string().uuid() } },
      async ({ page_id }) => {
        const node = await this.nodes.get(user, page_id).catch(() => null);
        if (!node) return text('Página não encontrada.');
        const meta = [`status: ${node.status}`, `versão: ${node.version}`, node.owner_name && `responsável: ${node.owner_name}`, `atualizado: ${new Date(node.updated_at).toISOString()}`]
          .filter(Boolean)
          .join(' · ');
        return text(`# ${node.title || 'Sem título'}\n\n_${meta}_\n\n${toMarkdown(node.content)}`);
      },
    );

    if (canWrite) {
      server.registerTool(
        'propose_change',
        {
          title: 'Propor alteração',
          description: 'Propõe uma nova versão (Markdown completo) de uma página. Uma pessoa precisa revisar e aprovar no Arkivo antes de entrar em vigor.',
          inputSchema: { page_id: z.string().uuid(), summary: z.string().min(3).max(200), markdown: z.string().min(1), title: z.string().max(300).optional() },
        },
        async ({ page_id, summary, markdown, title }) => {
          const cr = await this.crs.create(user.workspaceId, { nodeId: page_id, summary, markdown, title, source: 'mcp', authorId: user.id, authorLabel: `Integração MCP (token de ${user.name})` });
          return text(`Proposta criada (id ${cr.id}). Ela aparecerá na página para revisão e aprovação.`);
        },
      );

      server.registerTool(
        'create_page_draft',
        {
          title: 'Criar rascunho de página',
          description: 'Cria uma página em rascunho num espaço. O conteúdo fica como proposta pendente de aprovação.',
          inputSchema: { space_slug: z.string(), title: z.string().min(1).max(300), markdown: z.string().min(1), parent_id: z.string().uuid().optional() },
        },
        async ({ space_slug, title, markdown, parent_id }) => {
          const space = await this.db.selectFrom('spaces').select('id').where('workspace_id', '=', user.workspaceId).where('slug', '=', space_slug).executeTakeFirst();
          if (!space) throw new NotFoundException('Espaço não encontrado');
          const node = await this.nodes.create(user, { spaceId: space.id, parentId: parent_id ?? null, title, status: 'draft' });
          await this.crs.create(user.workspaceId, { nodeId: node.id, summary: 'Conteúdo inicial enviado por integração', markdown, title, source: 'mcp', authorId: user.id, authorLabel: `Integração MCP (token de ${user.name})` });
          return text(`Rascunho criado: "${title}" (id ${node.id}). O conteúdo aguarda aprovação na página.`);
        },
      );
    }

    return server;
  }
}

@Module({ imports: [NodesModule, ChangeRequestsModule], controllers: [McpController], providers: [ApiTokensService] })
export class McpModule {}
