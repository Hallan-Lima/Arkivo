import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Kysely } from 'kysely';
import bcrypt from 'bcryptjs';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { randomToken, sha256 } from '../common/crypto';
import { SettingsService } from '../settings/settings.service';
import { MailService, emailLayout } from '../settings/mail.service';

export const AUTH_COOKIE = 'arkivo_token';
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const hashPassword = (p: string) => bcrypt.hash(p, 12);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Kysely<DB>,
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  async needsSetup() {
    const row = await this.db.selectFrom('users').select('id').limit(1).executeTakeFirst();
    return !row;
  }

  /** Primeiro acesso: cria o workspace e o administrador. */
  async setup(input: { workspaceName: string; name: string; email: string; password: string }) {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx.selectFrom('users').select('id').limit(1).executeTakeFirst();
      if (existing) throw new ConflictException('O Arkivo já foi configurado');

      const ws = await trx.insertInto('workspaces').values({ name: input.workspaceName }).returning('id').executeTakeFirstOrThrow();
      const user = await trx
        .insertInto('users')
        .values({
          workspace_id: ws.id,
          name: input.name,
          email: input.email.toLowerCase(),
          password_hash: await hashPassword(input.password),
          role: 'admin',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return this.sign(user.id);
    });
  }

  async login(email: string, password: string) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'password_hash', 'active'])
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (!user.active) throw new UnauthorizedException('Usuário desativado. Procure o administrador.');
    await this.db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute();
    return this.sign(user.id);
  }

  async me(userId: string) {
    const me = await this.db
      .selectFrom('users')
      .innerJoin('workspaces', 'workspaces.id', 'users.workspace_id')
      .select(['users.id', 'users.name', 'users.email', 'users.role', 'workspaces.id as workspaceId', 'workspaces.name as workspaceName'])
      .where('users.id', '=', userId)
      .executeTakeFirstOrThrow();
    const ai = await this.settings.get(me.workspaceId, 'ai');
    return {
      ...me,
      features: {
        ai: ai.enabled && !!ai.model,
        aiProposals: ai.enabled && !!ai.model && ai.allowProposals,
        email: await this.mail.isConfigured(me.workspaceId),
      },
    };
  }

  async updateProfile(userId: string, name: string) {
    await this.db.updateTable('users').set({ name }).where('id', '=', userId).execute();
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.db.selectFrom('users').select('password_hash').where('id', '=', userId).executeTakeFirstOrThrow();
    if (!(await bcrypt.compare(current, user.password_hash))) throw new BadRequestException('Senha atual incorreta');
    await this.db.updateTable('users').set({ password_hash: await hashPassword(next) }).where('id', '=', userId).execute();
    return { ok: true };
  }

  // ---------- Redefinição de senha ----------

  /** Gera um link de uso único para definir/redefinir a senha. */
  async createResetLink(userId: string, workspaceId: string, hours = 24) {
    const token = randomToken();
    await this.db
      .insertInto('password_resets')
      .values({ user_id: userId, token_hash: sha256(token), expires_at: new Date(Date.now() + hours * 3600_000) })
      .execute();
    const { publicUrl } = await this.settings.get(workspaceId, 'general');
    return `${publicUrl}/reset-password?token=${token}`;
  }

  async sendResetEmail(user: { id: string; name: string; email: string; workspace_id: string }, kind: 'reset' | 'invite') {
    const url = await this.createResetLink(user.id, user.workspace_id, kind === 'invite' ? 72 : 2);
    const title = kind === 'invite' ? 'Você foi convidado para o Arkivo' : 'Redefinição de senha';
    const body =
      kind === 'invite'
        ? `Olá, ${esc(user.name)}! Sua conta no Arkivo foi criada. Clique abaixo para definir sua senha (o link vale por 72 horas).`
        : `Olá, ${esc(user.name)}! Recebemos um pedido para redefinir sua senha. O link vale por 2 horas. Se não foi você, ignore este e-mail.`;
    await this.mail.send(user.workspace_id, user.email, title, `${title}\n\n${url}`, emailLayout(title, body, { label: kind === 'invite' ? 'Definir senha' : 'Redefinir senha', url }));
    return url;
  }

  /** Sempre responde igual, para não revelar quais e-mails existem. */
  async forgotPassword(email: string) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'workspace_id', 'active'])
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
    const anyWs = await this.db.selectFrom('workspaces').select('id').limit(1).executeTakeFirst();
    const emailEnabled = anyWs ? await this.mail.isConfigured(anyWs.id) : false;
    if (user?.active && emailEnabled) {
      try {
        await this.sendResetEmail(user, 'reset');
      } catch {
        /* não revela falhas */
      }
    }
    return { ok: true, emailEnabled };
  }

  async checkResetToken(token: string) {
    const row = await this.findValidReset(token);
    return row ? { valid: true, email: row.email, name: row.name } : { valid: false };
  }

  async resetPassword(token: string, password: string) {
    const row = await this.findValidReset(token);
    if (!row) throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ password_hash: await hashPassword(password), last_login_at: new Date() }).where('id', '=', row.user_id).execute();
      await trx.updateTable('password_resets').set({ used_at: new Date() }).where('user_id', '=', row.user_id).where('used_at', 'is', null).execute();
    });
    return this.sign(row.user_id);
  }

  private findValidReset(token: string) {
    return this.db
      .selectFrom('password_resets')
      .innerJoin('users', 'users.id', 'password_resets.user_id')
      .select(['password_resets.user_id', 'users.email', 'users.name'])
      .where('password_resets.token_hash', '=', sha256(token))
      .where('password_resets.used_at', 'is', null)
      .where('password_resets.expires_at', '>', new Date())
      .where('users.active', '=', true)
      .executeTakeFirst();
  }

  private sign(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }
}
