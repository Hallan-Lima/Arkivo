import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB)');
export const FONTS = ['sans', 'serif', 'mono', 'humanist', 'geometric', 'slab'] as const;
export const LAYOUTS = ['standard', 'report', 'compact', 'wide', 'letter'] as const;

const designSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  palette: z.object({ primary: color, accent: color, text: color, background: color, heading: color, muted: color }),
  fontHeading: z.enum(FONTS),
  fontBody: z.enum(FONTS),
  layout: z.enum(LAYOUTS),
  headerText: z.string().trim().max(200).nullish(),
  footerText: z.string().trim().max(300).nullish(),
  logoFileId: z.string().uuid().nullish(),
  coverFileId: z.string().uuid().nullish(),
  /** Diretrizes de conteúdo usadas pela IA ao gerar documentos com este design. */
  guidelines: z.string().trim().max(4000).nullish(),
});
type DesignInput = z.infer<typeof designSchema>;

const COLUMNS = [
  'doc_designs.id',
  'doc_designs.name',
  'doc_designs.description',
  'doc_designs.palette',
  'doc_designs.font_heading',
  'doc_designs.font_body',
  'doc_designs.layout',
  'doc_designs.header_text',
  'doc_designs.footer_text',
  'doc_designs.logo_file_id',
  'doc_designs.cover_file_id',
  'doc_designs.guidelines',
  'doc_designs.created_at',
  'doc_designs.updated_at',
] as const;

@Injectable()
export class DesignsService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  list(workspaceId: string) {
    return this.db
      .selectFrom('doc_designs')
      .select(COLUMNS)
      .select((eb) => eb.selectFrom('nodes').whereRef('nodes.design_id', '=', 'doc_designs.id').select(eb.fn.countAll<number>().as('c')).as('usage'))
      .where('workspace_id', '=', workspaceId)
      .orderBy('name')
      .execute();
  }

  async get(workspaceId: string, id: string) {
    const d = await this.db.selectFrom('doc_designs').select(COLUMNS).where('id', '=', id).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!d) throw new NotFoundException('Design não encontrado');
    return d;
  }

  private async values(workspaceId: string, input: DesignInput) {
    for (const fileId of [input.logoFileId, input.coverFileId]) {
      if (!fileId) continue;
      const f = await this.db.selectFrom('files').select(['mime']).where('id', '=', fileId).where('workspace_id', '=', workspaceId).executeTakeFirst();
      if (!f || !f.mime.startsWith('image/')) throw new BadRequestException('Imagem do design não encontrada');
    }
    return {
      name: input.name,
      description: input.description ?? null,
      palette: JSON.stringify(input.palette),
      font_heading: input.fontHeading,
      font_body: input.fontBody,
      layout: input.layout,
      header_text: input.headerText ?? null,
      footer_text: input.footerText ?? null,
      logo_file_id: input.logoFileId ?? null,
      cover_file_id: input.coverFileId ?? null,
      guidelines: input.guidelines ?? null,
    };
  }

  async create(user: AuthUser, input: DesignInput) {
    const values = await this.values(user.workspaceId, input);
    return this.db
      .insertInto('doc_designs')
      .values({ ...values, workspace_id: user.workspaceId, created_by: user.id })
      .returning(['id'])
      .executeTakeFirstOrThrow();
  }

  async update(user: AuthUser, id: string, input: DesignInput) {
    await this.get(user.workspaceId, id);
    const values = await this.values(user.workspaceId, input);
    await this.db.updateTable('doc_designs').set({ ...values, updated_at: new Date() }).where('id', '=', id).execute();
    return { ok: true };
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user.workspaceId, id);
    await this.db.deleteFrom('doc_designs').where('id', '=', id).execute();
    return { ok: true };
  }
}

@Controller('designs')
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.designs.list(user.workspaceId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.designs.get(user.workspaceId, id);
  }

  @Post()
  @MinRole('editor')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(designSchema)) body: DesignInput) {
    return this.designs.create(user, body);
  }

  @Patch(':id')
  @MinRole('editor')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(designSchema)) body: DesignInput) {
    return this.designs.update(user, id, body);
  }

  @Delete(':id')
  @MinRole('editor')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.designs.remove(user, id);
  }
}

@Module({ controllers: [DesignsController], providers: [DesignsService] })
export class DesignsModule {}
