import { Body, Controller, Get, HttpCode, Logger, Module, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { AiModule } from '../ai/ai.module';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { AiService } from '../ai/ai.service';
import { IndexerService } from './indexer.service';
import { RetrievalService, scopeSchema } from './retrieval.service';
import { NotebookService } from './notebook.service';

const chatSchema = z.object({
  nodeId: z.string().uuid().nullish(),
  scope: scopeSchema,
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) }))
    .min(1)
    .max(40),
});

const proposeSchema = z.object({
  nodeId: z.string().uuid(),
  instruction: z.string().trim().min(3).max(4000),
  /** Usar outras fontes como referência (atualizar documento com base em outros). */
  useSources: z.boolean().default(false),
  scope: scopeSchema,
  referenceNodeIds: z.array(z.string().uuid()).max(10).default([]),
});

const studioSchema = z.object({
  kind: z.enum(['summary', 'briefing', 'faq', 'study_guide', 'timeline', 'mindmap', 'report', 'new_doc']),
  scope: scopeSchema,
  nodeId: z.string().uuid().nullish(),
  instruction: z.string().trim().max(4000).optional(),
  designId: z.string().uuid().nullish(),
});

const auditSchema = z.object({
  scope: scopeSchema,
  deep: z.boolean().default(false),
  maxDocs: z.number().int().min(1).max(30).default(8),
});

/** Primeira linha do corpo do chat: metadados (fontes numeradas). O resto é o texto em streaming. */
export const SOURCES_PREFIX = '\u001eSOURCES ';

@Controller()
export class NotebookController {
  private readonly log = new Logger('Notebook');
  constructor(
    private readonly notebook: NotebookService,
    private readonly retrieval: RetrievalService,
    private readonly indexer: IndexerService,
    private readonly changeRequests: ChangeRequestsService,
    private readonly ai: AiService,
    @InjectDb() private readonly db: Kysely<DB>,
  ) {}

  @Post('ai/chat')
  async chat(@CurrentUser() user: AuthUser, @Body(new ZodPipe(chatSchema)) body: z.infer<typeof chatSchema>, @Res() res: FastifyReply) {
    const { stream, sources, mode } = await this.notebook.chat(user.workspaceId, body.messages, body.scope, body.nodeId ?? undefined);
    res.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    res.raw.write(`${SOURCES_PREFIX}${JSON.stringify({ sources, mode })}\n`);
    try {
      for await (const chunk of stream) res.raw.write(chunk);
    } catch (e) {
      this.log.warn(`Erro no chat: ${(e as Error).message}`);
      res.raw.write(`\n\n> ⚠️ Erro ao falar com o provedor de IA: ${(e as Error).message}`);
    }
    res.raw.end();
  }

  @Post('ai/propose')
  @MinRole('editor')
  @HttpCode(200)
  async propose(@CurrentUser() user: AuthUser, @Body(new ZodPipe(proposeSchema)) body: z.infer<typeof proposeSchema>) {
    const result =
      body.useSources || body.referenceNodeIds.length
        ? await this.notebook.proposeWithSources(user.workspaceId, body.nodeId, body.instruction, body.scope, body.referenceNodeIds)
        : await this.ai.propose(user.workspaceId, body.nodeId, body.instruction);
    return this.changeRequests.create(user.workspaceId, {
      nodeId: body.nodeId,
      summary: result.summary,
      instruction: body.instruction,
      markdown: result.markdown,
      source: 'ai',
      authorId: user.id,
      authorLabel: `IA (a pedido de ${user.name})`,
    });
  }

  @Post('notebook/scope')
  @HttpCode(200)
  scope(@CurrentUser() user: AuthUser, @Body(new ZodPipe(z.object({ scope: scopeSchema }))) body: { scope: z.infer<typeof scopeSchema> }) {
    return this.retrieval.scopeSummary(user.workspaceId, body.scope);
  }

  @Post('notebook/studio')
  @HttpCode(200)
  async studio(@CurrentUser() user: AuthUser, @Body(new ZodPipe(studioSchema)) body: z.infer<typeof studioSchema>) {
    let guidelines: string | undefined;
    if (body.designId) {
      const d = await this.db
        .selectFrom('doc_designs')
        .select(['name', 'guidelines', 'layout'])
        .where('id', '=', body.designId)
        .where('workspace_id', '=', user.workspaceId)
        .executeTakeFirst();
      if (d) guidelines = [`Modelo "${d.name}" (layout ${d.layout}).`, d.guidelines].filter(Boolean).join('\n');
    }
    return this.notebook.studio(user.workspaceId, {
      kind: body.kind,
      scope: body.scope,
      nodeId: body.nodeId ?? undefined,
      instruction: body.instruction,
      guidelines,
    });
  }

  @Post('notebook/audit')
  @HttpCode(200)
  audit(@CurrentUser() user: AuthUser, @Body(new ZodPipe(auditSchema)) body: z.infer<typeof auditSchema>) {
    return this.notebook.audit(user.workspaceId, body.scope, { deep: body.deep, maxDocs: body.maxDocs });
  }

  @Get('notebook/status')
  status(@CurrentUser() user: AuthUser) {
    return this.indexer.status(user.workspaceId);
  }

  /** Força reindexar tudo (ex.: depois de trocar a forma de quebrar os trechos). */
  @Post('admin/notebook/reindex')
  @MinRole('admin')
  @HttpCode(200)
  async reindex(@CurrentUser() user: AuthUser) {
    await this.db
      .updateTable('nodes')
      .set({ indexed_at: null })
      .where('space_id', 'in', (eb) => eb.selectFrom('spaces').select('id').where('workspace_id', '=', user.workspaceId))
      .execute();
    this.indexer.kick();
    return { ok: true };
  }
}

@Module({
  imports: [AiModule, ChangeRequestsModule],
  controllers: [NotebookController],
  providers: [NotebookService, RetrievalService, IndexerService],
  exports: [RetrievalService, IndexerService],
})
export class NotebookModule {}
