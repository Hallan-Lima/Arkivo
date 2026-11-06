import { Body, Controller, Delete, Get, Module, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { NodesService } from './nodes.service';

const nodeType = z.enum(['page', 'process', 'diagram', 'board', 'sql', 'data_table']);
const createSchema = z.object({
  spaceId: z.string().uuid(),
  parentId: z.string().uuid().nullish(),
  title: z.string().max(300).optional(),
  type: nodeType.optional(),
  content: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'in_review', 'published', 'outdated']).optional(),
  sourceFileId: z.string().uuid().optional(),
});
const updateSchema = z.object({
  title: z.string().max(300).optional(),
  icon: z.string().max(16).nullish(),
  content: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'in_review', 'published', 'outdated']).optional(),
  ownerId: z.string().uuid().nullish(),
  reviewDueAt: z.string().datetime({ offset: true }).nullish(),
});
const moveSchema = z.object({ parentId: z.string().uuid().nullable(), position: z.number().finite() });
const checkpointSchema = z.object({ message: z.string().trim().min(1).max(200) });

@Controller()
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get('review-queue')
  reviewQueue(@CurrentUser() user: AuthUser) {
    return this.nodes.reviewQueue(user);
  }

  @Get('spaces/:spaceId/tree')
  tree(@CurrentUser() user: AuthUser, @Param('spaceId', ParseUUIDPipe) spaceId: string) {
    return this.nodes.tree(user, spaceId);
  }

  @Post('nodes')
  @MinRole('editor')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.nodes.create(user, body);
  }

  @Get('nodes/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.get(user, id);
  }

  @Patch('nodes/:id')
  @MinRole('editor')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.nodes.update(user, id, body);
  }

  @Post('nodes/:id/move')
  @MinRole('editor')
  move(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(moveSchema)) body: z.infer<typeof moveSchema>) {
    return this.nodes.move(user, id, body);
  }

  @Delete('nodes/:id')
  @MinRole('editor')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.remove(user, id);
  }

  @Get('nodes/:id/versions')
  versions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.versions(user, id);
  }

  @Post('nodes/:id/versions')
  @MinRole('editor')
  checkpoint(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(checkpointSchema)) body: z.infer<typeof checkpointSchema>) {
    return this.nodes.checkpoint(user, id, body.message);
  }

  @Get('nodes/:id/versions/:version')
  version(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) {
    return this.nodes.version(user, id, version);
  }

  @Post('nodes/:id/versions/:version/restore')
  @MinRole('editor')
  restore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) {
    return this.nodes.restore(user, id, version);
  }
}

@Module({ controllers: [NodesController], providers: [NodesService], exports: [NodesService] })
export class NodesModule {}
