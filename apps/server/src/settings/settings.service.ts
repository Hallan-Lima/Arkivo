import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { decryptSecret, encryptSecret } from '../common/crypto';

export type AiProvider = 'openai' | 'anthropic' | 'openai-compatible' | 'ollama';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKeyEnc?: string;
  /** Instruções extras da empresa (tom, idioma, padrões). */
  instructions: string;
  allowProposals: boolean;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEnc?: string;
  from: string;
}

export interface GeneralSettings {
  publicUrl: string;
  defaultReviewDays: number;
}

const DEFAULTS = {
  ai: { enabled: false, provider: 'openai', baseUrl: '', model: '', instructions: '', allowProposals: true } as AiSettings,
  smtp: { enabled: false, host: '', port: 587, secure: false, user: '', from: '' } as SmtpSettings,
  general: { publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5173', defaultReviewDays: 180 } as GeneralSettings,
};
type Key = keyof typeof DEFAULTS;
type Value<K extends Key> = (typeof DEFAULTS)[K];

@Injectable()
export class SettingsService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  async get<K extends Key>(workspaceId: string, key: K): Promise<Value<K>> {
    const row = await this.db.selectFrom('settings').select('value').where('workspace_id', '=', workspaceId).where('key', '=', key).executeTakeFirst();
    return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as Value<K>;
  }

  async set<K extends Key>(workspaceId: string, key: K, value: Value<K>) {
    const json = JSON.stringify(value);
    await this.db
      .insertInto('settings')
      .values({ workspace_id: workspaceId, key, value: json })
      .onConflict((oc) => oc.columns(['workspace_id', 'key']).doUpdateSet({ value: json, updated_at: new Date() }))
      .execute();
  }

  // ---- IA ----
  async getAi(workspaceId: string) {
    const s = await this.get(workspaceId, 'ai');
    return { ...s, apiKey: decryptSecret(s.apiKeyEnc) };
  }

  /** Versão segura para enviar ao navegador (nunca devolve a chave). */
  async getAiPublic(workspaceId: string) {
    const { apiKeyEnc, ...rest } = await this.get(workspaceId, 'ai');
    return { ...rest, hasApiKey: !!apiKeyEnc };
  }

  async setAi(workspaceId: string, input: Omit<AiSettings, 'apiKeyEnc'> & { apiKey?: string | null }) {
    const current = await this.get(workspaceId, 'ai');
    const { apiKey, ...rest } = input;
    const apiKeyEnc = apiKey === undefined ? current.apiKeyEnc : apiKey ? encryptSecret(apiKey) : undefined;
    await this.set(workspaceId, 'ai', { ...rest, apiKeyEnc });
  }

  // ---- SMTP ----
  async getSmtp(workspaceId: string) {
    const s = await this.get(workspaceId, 'smtp');
    return { ...s, password: decryptSecret(s.passwordEnc) };
  }

  async getSmtpPublic(workspaceId: string) {
    const { passwordEnc, ...rest } = await this.get(workspaceId, 'smtp');
    return { ...rest, hasPassword: !!passwordEnc };
  }

  async setSmtp(workspaceId: string, input: Omit<SmtpSettings, 'passwordEnc'> & { password?: string | null }) {
    const current = await this.get(workspaceId, 'smtp');
    const { password, ...rest } = input;
    const passwordEnc = password === undefined ? current.passwordEnc : password ? encryptSecret(password) : undefined;
    await this.set(workspaceId, 'smtp', { ...rest, passwordEnc });
  }
}
