import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { randomToken } from '../common/crypto';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { AuthService, hashPassword } from '../auth/auth.service';
import { MailService } from '../settings/mail.service';

const roleSchema = z.enum(['admin', 'editor', 'viewer']);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  role: roleSchema.default('editor'),
  /** Se vazio, o usuário define a própria senha pelo link de convite. */
  password: z.string().min(8).max(200).optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});
const passwordSchema = z.object({ password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(200) });

const columns = ['id', 'name', 'email', 'role', 'active', 'last_login_at', 'created_at'] as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  list(workspaceId: string) {
    return this.db.selectFrom('users').select(columns).where('workspace_id', '=', workspaceId).orderBy('name').execute();
  }

  async create(actor: AuthUser, input: z.infer<typeof createSchema>) {
    const email = input.email.toLowerCase();
    const exists = await this.db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
    if (exists) throw new ConflictException('Já existe um usuário com esse e-mail');

    const user = await this.db
      .insertInto('users')
      .values({
        workspace_id: actor.workspaceId,
        name: input.name,
        email,
        role: input.role,
        password_hash: await hashPassword(input.password ?? randomToken()),
      })
      .returning([...columns, 'workspace_id'])
      .executeTakeFirstOrThrow();

    // Sem senha definida: gera convite (por e-mail, se configurado; senão devolve o link para o admin repassar).
    let inviteLink: string | null = null;
    let emailed = false;
    if (!input.password) {
      if (await this.mail.isConfigured(actor.workspaceId)) {
        try {
          inviteLink = await this.auth.sendResetEmail(user, 'invite');
          emailed = true;
        } catch {
          inviteLink = await this.auth.createResetLink(user.id, actor.workspaceId, 72);
        }
      } else {
        inviteLink = await this.auth.createResetLink(user.id, actor.workspaceId, 72);
      }
    }
    const { workspace_id: _ws, ...publicUser } = user;
    return { user: publicUser, inviteLink, emailed };
  }

  async update(actor: AuthUser, id: string, input: z.infer<typeof updateSchema>) {
    if (id === actor.id && (input.role && input.role !== 'admin')) {
      throw new BadRequestException('Você não pode remover seu próprio acesso de administrador');
    }
    if (id === actor.id && input.active === false) throw new BadRequestException('Você não pode desativar a si mesmo');
    if (input.email) {
      const taken = await this.db.selectFrom('users').select('id').where('email', '=', input.email.toLowerCase()).where('id', '!=', id).executeTakeFirst();
      if (taken) throw new ConflictException('Já existe um usuário com esse e-mail');
      input.email = input.email.toLowerCase();
    }
    const row = await this.db
      .updateTable('users')
      .set(input)
      .where('id', '=', id)
      .where('workspace_id', '=', actor.workspaceId)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException();
    return row;
  }

  async resetLink(actor: AuthUser, id: string, sendEmail: boolean) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'workspace_id'])
      .where('id', '=', id)
      .where('workspace_id', '=', actor.workspaceId)
      .executeTakeFirst();
    if (!user) throw new NotFoundException();
    if (sendEmail) {
      const link = await this.auth.sendResetEmail(user, 'reset');
      return { link, emailed: true };
    }
    return { link: await this.auth.createResetLink(user.id, actor.workspaceId, 24), emailed: false };
  }

  async setPassword(actor: AuthUser, id: string, password: string) {
    const res = await this.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(password) })
      .where('id', '=', id)
      .where('workspace_id', '=', actor.workspaceId)
      .executeTakeFirst();
    if (!Number(res.numUpdatedRows)) throw new NotFoundException();
    return { ok: true };
  }

  async remove(actor: AuthUser, id: string) {
    if (id === actor.id) throw new BadRequestException('Você não pode excluir a si mesmo');
    await this.db.deleteFrom('users').where('id', '=', id).where('workspace_id', '=', actor.workspaceId).execute();
    return { ok: true };
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.workspaceId);
  }

  @Post()
  @MinRole('admin')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.users.create(user, body);
  }

  @Patch(':id')
  @MinRole('admin')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.users.update(user, id, body);
  }

  @Post(':id/reset-link')
  @MinRole('admin')
  @HttpCode(200)
  resetLink(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { sendEmail?: boolean }) {
    return this.users.resetLink(user, id, !!body?.sendEmail);
  }

  @Post(':id/password')
  @MinRole('admin')
  @HttpCode(200)
  setPassword(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(passwordSchema)) body: z.infer<typeof passwordSchema>) {
    return this.users.setPassword(user, id, body.password);
  }

  @Delete(':id')
  @MinRole('admin')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(user, id);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
