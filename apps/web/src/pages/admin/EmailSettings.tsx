import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { Button, Field, Input } from '@/components/ui';
import { Spinner } from '@/components/ui';
import { SettingsCard, Toggle } from './AdminLayout';

interface Smtp {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
}

export function EmailSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'smtp'], queryFn: () => api.get<Smtp>('/admin/settings/smtp') });
  const [form, setForm] = useState<Smtp | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const { hasPassword: _h, ...rest } = form!;
      return api.put('/admin/settings/smtp', { ...rest, ...(password !== undefined ? { password } : {}) });
    },
    onSuccess: () => {
      setPassword(undefined);
      qc.invalidateQueries({ queryKey: ['admin', 'smtp'] });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>('/admin/settings/smtp/test') });

  if (!form) return <Spinner />;
  const set = (patch: Partial<Smtp>) => setForm({ ...form, ...patch });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-6"
    >
      <SettingsCard title="Servidor de e-mail (SMTP)" description="Usado para convites, redefinição de senha e, em breve, avisos de revisão vencida.">
        <div className="space-y-5">
          <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Enviar e-mails" description="Sem isso, links de convite e de senha precisam ser copiados manualmente pelo administrador." />
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Servidor (host)">
              <Input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.office365.com" />
            </Field>
            <Field label="Porta">
              <Input type="number" value={form.port} onChange={(e) => set({ port: Number(e.target.value) })} />
            </Field>
          </div>
          <Toggle checked={form.secure} onChange={(v) => set({ secure: v })} label="Conexão SSL/TLS direta" description="Normalmente ativado na porta 465. Na porta 587 deixe desligado (STARTTLS automático)." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuário">
              <Input value={form.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Senha" hint={form.hasPassword && password === undefined ? 'Senha salva. Digite para trocar.' : undefined}>
              <Input type="password" autoComplete="new-password" value={password ?? ''} placeholder={form.hasPassword ? '••••••••' : ''} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <Field label="Remetente" hint='Ex.: "Arkivo <docs@suaempresa.com.br>"'>
            <Input value={form.from} onChange={(e) => set({ from: e.target.value })} />
          </Field>
        </div>
      </SettingsCard>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={save.isPending}>
          Salvar
        </Button>
        <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()} disabled={!data?.enabled}>
          <Send className="size-4" /> Enviar e-mail de teste
        </Button>
        {save.isSuccess && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" /> Salvo
          </span>
        )}
        {test.data && <span className={test.data.ok ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>{test.data.message}</span>}
        {save.error && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
      </div>
    </form>
  );
}
