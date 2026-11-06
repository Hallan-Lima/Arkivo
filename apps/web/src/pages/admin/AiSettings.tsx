import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Spinner, Textarea } from '@/components/ui';
import { SettingsCard, Toggle } from './AdminLayout';

type Provider = 'openai' | 'anthropic' | 'openai-compatible' | 'ollama';
interface AiForm {
  enabled: boolean;
  provider: Provider;
  baseUrl: string;
  model: string;
  instructions: string;
  allowProposals: boolean;
  hasApiKey: boolean;
}

const PROVIDERS: { id: Provider; name: string; desc: string; key: boolean; baseUrl: string; urlHint: string; modelHint: string }[] = [
  { id: 'openai', name: 'OpenAI', desc: 'API oficial da OpenAI (ou Azure via URL).', key: true, baseUrl: '', urlHint: 'Opcional. Deixe vazio para a API oficial.', modelHint: 'Ex.: o nome do modelo de chat disponível na sua conta' },
  { id: 'anthropic', name: 'Anthropic (Claude)', desc: 'Modelos Claude pela API da Anthropic.', key: true, baseUrl: '', urlHint: 'Opcional. Deixe vazio para a API oficial.', modelHint: 'Ex.: claude-sonnet-5-5' },
  { id: 'ollama', name: 'Ollama (local)', desc: 'Roda na sua infraestrutura; nada sai da empresa.', key: false, baseUrl: 'http://localhost:11434/v1', urlHint: 'Endereço do Ollama com /v1 no final.', modelHint: 'Ex.: llama3.1, qwen2.5, mistral' },
  { id: 'openai-compatible', name: 'Compatível com OpenAI', desc: 'LM Studio, vLLM, OpenRouter, Groq, Azure, gateways internos…', key: true, baseUrl: '', urlHint: 'Obrigatório. Ex.: http://servidor:1234/v1', modelHint: 'Nome do modelo exposto pelo provedor' },
];

export function AiSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'ai'], queryFn: () => api.get<AiForm>('/admin/settings/ai') });
  const [form, setForm] = useState<AiForm | null>(null);
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const payload = () => {
    const { hasApiKey: _h, ...rest } = form!;
    return { ...rest, ...(apiKey !== undefined ? { apiKey } : {}) };
  };
  const save = useMutation({
    mutationFn: () => api.put('/admin/settings/ai', payload()),
    onSuccess: () => {
      setApiKey(undefined);
      qc.invalidateQueries({ queryKey: ['admin', 'ai'] });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; reply?: string; ms?: number; error?: string }>('/admin/settings/ai/test', payload()) });

  if (!form) return <Spinner />;
  const set = (patch: Partial<AiForm>) => setForm({ ...form, ...patch });
  const provider = PROVIDERS.find((p) => p.id === form.provider)!;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-6"
    >
      <SettingsCard title="Assistente de IA" description="Opcional. Com a IA ligada, as pessoas podem conversar com a documentação, pedir resumos e pedir alterações — que sempre passam por aprovação humana.">
        <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Habilitar IA nesta empresa" />
      </SettingsCard>

      <SettingsCard title="Provedor">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => set({ provider: p.id, baseUrl: p.baseUrl || (form.provider === p.id ? form.baseUrl : '') })}
              className={cn('rounded-lg border border-border p-3 text-left hover:bg-muted', form.provider === p.id && 'border-accent ring-1 ring-accent')}
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-fg-subtle">{p.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="URL base" hint={provider.urlHint}>
            <Input value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={provider.baseUrl || 'https://…'} />
          </Field>
          <Field label="Modelo" hint={provider.modelHint}>
            <Input value={form.model} onChange={(e) => set({ model: e.target.value })} />
          </Field>
          <Field label={provider.key ? 'Chave de API' : 'Chave de API (opcional)'} hint={form.hasApiKey && apiKey === undefined ? 'Chave salva (criptografada). Digite para trocar.' : 'Guardada criptografada no banco.'}>
            <Input type="password" autoComplete="new-password" value={apiKey ?? ''} placeholder={form.hasApiKey ? '••••••••••••' : ''} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()} disabled={!form.model}>
            <Zap className="size-4" /> Testar conexão
          </Button>
          {test.data?.ok && (
            <span className="text-sm text-emerald-600">
              Conectado — respondeu “{test.data.reply}” em {test.data.ms} ms
            </span>
          )}
          {test.data && !test.data.ok && <span className="text-sm text-red-600">{test.data.error}</span>}
        </div>
      </SettingsCard>

      <SettingsCard title="Comportamento">
        <div className="space-y-5">
          <Toggle
            checked={form.allowProposals}
            onChange={(v) => set({ allowProposals: v })}
            label="Permitir que a IA proponha alterações em documentos"
            description="A IA gera uma proposta com diff; um editor revisa e aceita ou rejeita. Nada é publicado sozinho."
          />
          <Field label="Instruções da empresa (opcional)" hint="Tom de voz, glossário, padrões de escrita. Enviadas em todas as conversas.">
            <Textarea rows={4} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="Ex.: Use linguagem formal. Chame o ERP de “Protheus”. Procedimentos devem ter seções Objetivo, Pré-requisitos e Passo a passo." />
          </Field>
        </div>
      </SettingsCard>

      <div className="flex items-start gap-2 rounded-lg bg-surface p-3 text-xs text-fg-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        Para responder, o Arkivo envia ao provedor trechos dos documentos relevantes à pergunta. Com um provedor local (Ollama, LM Studio), nenhum dado sai da sua rede.
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={save.isPending}>
          Salvar
        </Button>
        {save.isSuccess && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" /> Salvo
          </span>
        )}
        {save.error && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
      </div>
    </form>
  );
}
