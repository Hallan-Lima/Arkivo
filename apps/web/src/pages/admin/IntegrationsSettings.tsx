import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { SettingsCard, Toggle } from './AdminLayout';

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  can_write: boolean;
  last_used_at: string | null;
  created_at: string;
  user_name: string;
}

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check className="size-4" /> : <Copy className="size-4" />} {ok ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

export function IntegrationsSettings() {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({ queryKey: ['admin', 'tokens'], queryFn: () => api.get<TokenRow[]>('/admin/api-tokens') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<{ token: string }>('/admin/api-tokens', { name, canWrite }),
    onSuccess: (r) => {
      setCreated(r.token);
      setName('');
      setCanWrite(false);
      qc.invalidateQueries({ queryKey: ['admin', 'tokens'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/admin/api-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tokens'] }),
  });

  const url = `${window.location.origin}/api/mcp`;
  const config = JSON.stringify(
    { mcpServers: { arkivo: { type: 'http', url, headers: { Authorization: `Bearer ${created ?? 'SEU_TOKEN'}` } } } },
    null,
    2,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Servidor MCP"
        description="Conecte assistentes como Claude, Copilot, Cursor ou agentes internos à documentação. Eles podem listar, buscar e ler páginas e — com permissão de escrita — propor alterações que passam por aprovação humana."
      >
        <div className="space-y-3">
          <Field label="Endereço do servidor MCP (Streamable HTTP)">
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono text-xs" />
              <CopyButton text={url} />
            </div>
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">Exemplo de configuração do cliente</span>
              <CopyButton text={config} />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-200">{config}</pre>
          </div>
          <p className="text-xs text-fg-subtle">
            Ferramentas disponíveis: <code>list_spaces</code>, <code>list_pages</code>, <code>search_docs</code>, <code>read_page</code> e, com escrita, <code>propose_change</code> e{' '}
            <code>create_page_draft</code>.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard title="Tokens de API" description="Cada token age em nome de quem o criou e respeita o papel dessa pessoa.">
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Novo token
          </Button>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <KeyRound className="size-4 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-fg-subtle">
                  <code>{t.prefix}…</code> · {t.can_write ? 'leitura e propostas' : 'somente leitura'} · criado por {t.user_name} {timeAgo(t.created_at)} ·{' '}
                  {t.last_used_at ? `usado ${timeAgo(t.last_used_at)}` : 'nunca usado'}
                </div>
              </div>
              <button
                onClick={() => confirm(`Revogar o token "${t.name}"? Integrações que o usam vão parar de funcionar.`) && revoke.mutate(t.id)}
                className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-red-600"
                title="Revogar"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {!tokens.length && <div className="px-4 py-8 text-center text-sm text-fg-subtle">Nenhum token criado.</div>}
        </div>
      </SettingsCard>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setCreated(null);
        }}
        title={created ? 'Token criado' : 'Novo token de API'}
        description={created ? 'Copie agora: por segurança, ele não será exibido novamente.' : undefined}
      >
        {created ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={created} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <CopyButton text={created} />
            </div>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Concluir
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome" hint="Para identificar onde ele é usado. Ex.: Claude do time de infra">
              <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Toggle checked={canWrite} onChange={setCanWrite} label="Permitir propor alterações" description="Cria propostas e rascunhos que precisam de aprovação humana." />
            {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={create.isPending}>
                Criar token
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
