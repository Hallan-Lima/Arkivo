import { Body, Controller, Get, Global, HttpCode, Module, Post, Put } from '@nestjs/common';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { SettingsService } from './settings.service';
import { MailService, emailLayout } from './mail.service';

const generalSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  publicUrl: z.string().trim().url(),
  defaultReviewDays: z.number().int().min(0).max(3650),
});

const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(200),
  password: z.string().max(500).nullish(),
  from: z.string().trim().max(200),
});

@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @InjectDb() private readonly db: Kysely<DB>,
  ) {}

  @Get('general')
  @MinRole('admin')
  async getGeneral(@CurrentUser() user: AuthUser) {
    const ws = await this.db.selectFrom('workspaces').select('name').where('id', '=', user.workspaceId).executeTakeFirstOrThrow();
    return { workspaceName: ws.name, ...(await this.settings.get(user.workspaceId, 'general')) };
  }

  @Put('general')
  @MinRole('admin')
  async setGeneral(@CurrentUser() user: AuthUser, @Body(new ZodPipe(generalSchema)) body: z.infer<typeof generalSchema>) {
    await this.db.updateTable('workspaces').set({ name: body.workspaceName }).where('id', '=', user.workspaceId).execute();
    await this.settings.set(user.workspaceId, 'general', { publicUrl: body.publicUrl.replace(/\/+$/, ''), defaultReviewDays: body.defaultReviewDays });
    return { ok: true };
  }

  @Get('smtp')
  @MinRole('admin')
  getSmtp(@CurrentUser() user: AuthUser) {
    return this.settings.getSmtpPublic(user.workspaceId);
  }

  @Put('smtp')
  @MinRole('admin')
  async setSmtp(@CurrentUser() user: AuthUser, @Body(new ZodPipe(smtpSchema)) body: z.infer<typeof smtpSchema>) {
    await this.settings.setSmtp(user.workspaceId, { ...body, password: body.password ?? undefined });
    return { ok: true };
  }

  @Post('smtp/test')
  @MinRole('admin')
  @HttpCode(200)
  async testSmtp(@CurrentUser() user: AuthUser) {
    try {
      await this.mail.send(
        user.workspaceId,
        user.email,
        'Teste de e-mail do Arkivo',
        'Se você recebeu esta mensagem, o envio de e-mails está funcionando.',
        emailLayout('Tudo certo!', 'Se você recebeu esta mensagem, o envio de e-mails do Arkivo está funcionando.'),
      );
      return { ok: true, message: `E-mail de teste enviado para ${user.email}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, MailService],
  exports: [SettingsService, MailService],
})
export class SettingsModule {}
