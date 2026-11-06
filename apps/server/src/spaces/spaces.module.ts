import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífen')
    .max(60)
    .optional(),
  description: z.string().trim().max(500).nullish(),
  icon: z.string().max(16).nullish(),
  color: z.string().max(20).nullish(),
});
const updateSchema = createSchema.partial();

export function slugify(input: string) {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'espaco'
  );
}

const spaceColumns = ['spaces.id', 'spaces.name', 'spaces.slug', 'spaces.description', 'spaces.icon', 'spaces.color', 'spaces.created_at', 'spaces.updated_at'] as const;

@Injectable()
export class SpacesService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  list(workspaceId: string) {
    return this.db
      .selectFrom('spaces')
      .select(spaceColumns)
      .select((eb) =>
        eb.selectFrom('nodes').whereRef('nodes.space_id', '=', 'spaces.id').select(sql<number>`count(*)::int`.as('c')).as('nodeCount'),
      )
      .where('spaces.workspace_id', '=', workspaceId)
      .orderBy('spaces.name')
      .execute();
  }

  async getBySlug(workspaceId: string, slug: string) {
    const space = await this.db
      .selectFrom('spaces')
      .select(spaceColumns)
      .where('workspace_id', '=', workspaceId)
      .where('slug', '=', slug)
      .executeTakeFirst();
    if (!space) throw new NotFoundException('Espaço não encontrado');
    return space;
  }

  async create(user: AuthUser, input: z.infer<typeof createSchema>) {
    const slug = input.slug || slugify(input.name);
    const taken = await this.db.selectFrom('spaces').select('id').where('workspace_id', '=', user.workspaceId).where('slug', '=', slug).executeTakeFirst();
    if (taken) throw new ConflictException('Já existe um espaço com esse identificador');
    return this.db
      .insertInto('spaces')
      .values({
        workspace_id: user.workspaceId,
        name: input.name,
        slug,
        description: input.description ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        created_by: user.id,
      })
      .returning(['id', 'name', 'slug', 'description', 'icon', 'color', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
  }

  async update(user: AuthUser, id: string, input: z.infer<typeof updateSchema>) {
    const row = await this.db
      .updateTable('spaces')
      .set({ ...input, updated_at: new Date() })
      .where('id', '=', id)
      .where('workspace_id', '=', user.workspaceId)
      .returning(['id', 'name', 'slug', 'description', 'icon', 'color'])
      .executeTakeFirst();
    if (!row) throw new NotFoundException();
    return row;
  }

  async remove(user: AuthUser, id: string) {
    await this.db.deleteFrom('spaces').where('id', '=', id).where('workspace_id', '=', user.workspaceId).execute();
    return { ok: true };
  }
}

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.spaces.list(user.workspaceId);
  }

  @Get('by-slug/:slug')
  get(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.spaces.getBySlug(user.workspaceId, slug);
  }

  @Post()
  @MinRole('admin')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.spaces.create(user, body);
  }

  @Patch(':id')
  @MinRole('admin')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.spaces.update(user, id, body);
  }

  @Delete(':id')
  @MinRole('admin')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.spaces.remove(user, id);
  }
}

@Module({ controllers: [SpacesController], providers: [SpacesService] })
export class SpacesModule {}
