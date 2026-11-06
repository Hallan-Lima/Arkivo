import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { NodesService } from '../nodes/nodes.service';
import { NodesModule } from '../nodes/nodes.module';
import { ChangeRequestsService } from './change-requests.service';

const acceptSchema = z.object({
  /** Conteúdo final (JSON do editor), já revisado pelo usuário. */
  content: z.record(z.unknown()),
  title: z.string().max(300).optional(),
});

@Controller()
export class ChangeRequestsController {
  constructor(
    private readonly crs: ChangeRequestsService,
    private readonly nodes: NodesService,
  ) {}

  @Get('change-requests')
  listOpen(@CurrentUser() user: AuthUser) {
    return this.crs.listOpen(user.workspaceId);
  }

  @Get('nodes/:id/change-requests')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.crs.listForNode(user.workspaceId, id);
  }

  @Get('change-requests/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.crs.get(user.workspaceId, id);
  }

  @Post('change-requests/:id/accept')
  @MinRole('editor')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(acceptSchema)) body: z.infer<typeof acceptSchema>) {
    const cr = await this.crs.resolve(user.workspaceId, id, user.id, 'accepted');
    await this.nodes.update(user, cr.node_id, { content: body.content, ...(body.title !== undefined ? { title: body.title } : {}) });
    const origin = cr.source === 'ai' ? 'IA' : cr.source === 'mcp' ? 'integração' : 'usuário';
    return this.nodes.checkpoint(user, cr.node_id, `Proposta (${origin}) aceita: ${cr.summary}`.slice(0, 200));
  }

  @Post('change-requests/:id/reject')
  @MinRole('editor')
  @HttpCode(200)
  async reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.crs.resolve(user.workspaceId, id, user.id, 'rejected');
    return { ok: true };
  }
}

@Module({ imports: [NodesModule], controllers: [ChangeRequestsController], providers: [ChangeRequestsService], exports: [ChangeRequestsService] })
export class ChangeRequestsModule {}
