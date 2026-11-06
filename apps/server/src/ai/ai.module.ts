import { BadRequestException, Body, Controller, Get, HttpCode, Logger, Module, Post, Put, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { SettingsService } from '../settings/settings.service';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { AiService } from './ai.service';

const providerSchema = z.enum(['openai', 'anthropic', 'openai-compatible', 'ollama']);
const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: providerSchema,
  baseUrl: z.string().trim().max(500),
  model: z.string().trim().max(200),
  /** undefined = manter a chave salva; '' ou null = remover. */
  apiKey: z.string().max(1000).nullish(),
  instructions: z.string().max(4000),
  allowProposals: z.boolean(),
});

const chatSchema = z.object({
  nodeId: z.string().uuid().nullish(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) }))
    .min(1)
    .max(40),
});

const proposeSchema = z.object({
  nodeId: z.string().uuid(),
  instruction: z.string().trim().min(3).max(2000),
});

@Controller()
export class AiController {
  private readonly log = new Logger('AI');
  constructor(
    private readonly ai: AiService,
    private readonly settings: SettingsService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  @Get('admin/settings/ai')
  @MinRole('admin')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.settings.getAiPublic(user.workspaceId);
  }

  @Put('admin/settings/ai')
  @MinRole('admin')
  async setSettings(@CurrentUser() user: AuthUser, @Body(new ZodPipe(aiSettingsSchema)) body: z.infer<typeof aiSettingsSchema>) {
    if (body.enabled && !body.model) throw new BadRequestException('Informe o modelo para habilitar a IA');
    await this.settings.setAi(user.workspaceId, body);
    return { ok: true };
  }

  /** Testa a configuração do formulário (sem salvar). Sem `apiKey`, usa a chave já salva. */
  @Post('admin/settings/ai/test')
  @MinRole('admin')
  @HttpCode(200)
  async test(@CurrentUser() user: AuthUser, @Body(new ZodPipe(aiSettingsSchema)) body: z.infer<typeof aiSettingsSchema>) {
    const saved = await this.settings.getAi(user.workspaceId);
    try {
      return await this.ai.test({ ...body, apiKey: body.apiKey === undefined ? saved.apiKey : (body.apiKey ?? '') });
    } catch (e) {
      return { ok: false, error: (e as Error).message?.slice(0, 500) ?? 'Falha ao conectar' };
    }
  }

  @Post('ai/chat')
  async chat(@CurrentUser() user: AuthUser, @Body(new ZodPipe(chatSchema)) body: z.infer<typeof chatSchema>, @Res() res: FastifyReply) {
    const { stream, sources } = await this.ai.chat(user.workspaceId, body.messages, body.nodeId ?? undefined);
    res.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'X-Arkivo-Sources': encodeURIComponent(JSON.stringify(sources)),
    });
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
    const result = await this.ai.propose(user.workspaceId, body.nodeId, body.instruction);
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
}

@Module({ imports: [ChangeRequestsModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
