import { embedMany, type EmbeddingModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiSettings } from '../settings/settings.service';

type Settings = AiSettings & { apiKey: string; embedApiKey: string };

/**
 * Monta o modelo de embeddings configurado. Devolve null quando a busca semântica está desligada
 * (o notebook continua funcionando só com busca por palavras).
 * Sem chave própria, reaproveita a chave do chat quando o provedor é o mesmo.
 */
export function buildEmbeddingModel(s: Settings): { model: EmbeddingModel; id: string } | null {
  if (!s.enabled || s.embedProvider === 'none' || !s.embedModel?.trim()) return null;
  const baseURL = s.embedBaseUrl?.trim() || undefined;
  const key = s.embedApiKey || (s.embedProvider === s.provider ? s.apiKey : '') || undefined;
  const id = `${s.embedProvider}:${s.embedModel.trim()}`;
  switch (s.embedProvider) {
    case 'openai':
      return { model: createOpenAI({ apiKey: key, baseURL }).embeddingModel(s.embedModel.trim()), id };
    case 'ollama':
      return {
        model: createOpenAICompatible({ name: 'ollama', baseURL: baseURL ?? 'http://localhost:11434/v1', apiKey: key }).embeddingModel(s.embedModel.trim()),
        id,
      };
    case 'openai-compatible':
      if (!baseURL) return null;
      return { model: createOpenAICompatible({ name: 'custom-embed', baseURL, apiKey: key }).embeddingModel(s.embedModel.trim()), id };
    default:
      return null;
  }
}

export async function embedTexts(model: EmbeddingModel, values: string[]): Promise<number[][]> {
  if (!values.length) return [];
  const { embeddings } = await embedMany({ model, values, maxParallelCalls: 2 });
  return embeddings;
}

/** Formato literal aceito pelo pgvector: '[0.1,0.2,...]'. */
export const toVectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
