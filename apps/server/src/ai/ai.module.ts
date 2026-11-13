import { BadRequestException, Body, Controller, Get, HttpCode, Module, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, MinRole } from '../auth/public.decorator';
import { SettingsService } from '../settings/settings.service';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { AiService } from './ai.service';
import { buildEmbeddingModel, embedTexts } from '../notebook/embeddings';

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
  embedProvider: z.enum(['none', 'openai', 'ollama', 'openai-compatible']).default('none'),
  embedModel: z.string().trim().max(200).default(''),
  embedBaseUrl: z.string().trim().max(500).default(''),
  /** undefined = manter a chave salva; '' ou null = remover. */
  embedApiKey: z.string().max(1000).nullish(),
  retrievalChunks: z.number().int().min(3).max(30).default(10),
});

@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly settings: SettingsService,
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
    const embedChanged = await this.embeddingChanged(user.workspaceId, body);
    await this.settings.setAi(user.workspaceId, body);
    return { ok: true, reindex: embedChanged };
  }

  /** Trocar o modelo de embeddings não apaga nada: o indexador recalcula os vetores aos poucos. */
  private async embeddingChanged(workspaceId: string, body: z.infer<typeof aiSettingsSchema>) {
    const cur = await this.settings.getAi(workspaceId);
    return cur.embedProvider !== body.embedProvider || cur.embedModel !== body.embedModel;
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

  /** Testa o modelo de embeddings do formulário (sem salvar). */
  @Post('admin/settings/ai/test-embeddings')
  @MinRole('admin')
  @HttpCode(200)
  async testEmbeddings(@CurrentUser() user: AuthUser, @Body(new ZodPipe(aiSettingsSchema)) body: z.infer<typeof aiSettingsSchema>) {
    const saved = await this.settings.getAi(user.workspaceId);
    const em = buildEmbeddingModel({
      ...body,
      enabled: true,
      apiKey: body.apiKey === undefined ? saved.apiKey : (body.apiKey ?? ''),
      embedApiKey: body.embedApiKey === undefined ? saved.embedApiKey : (body.embedApiKey ?? ''),
    });
    if (!em) return { ok: false, error: 'Escolha um provedor e um modelo de embeddings (no compatível com OpenAI, informe também a URL).' };
    const started = Date.now();
    try {
      const [vec] = await embedTexts(em.model, ['teste de conexão do Arkivo']);
      return { ok: true, dimensions: vec.length, ms: Date.now() - started };
    } catch (e) {
      return { ok: false, error: (e as Error).message?.slice(0, 500) ?? 'Falha ao conectar' };
    }
  }
}

@Module({ imports: [ChangeRequestsModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
