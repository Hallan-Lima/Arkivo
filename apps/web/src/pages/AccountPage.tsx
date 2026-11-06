import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/types';
import { useLayout } from '@/components/AppLayout';
import { Button, Field, Input } from '@/components/ui';

export function AccountPage() {
  const { me } = useLayout();
  const qc = useQueryClient();
  const [name, setName] = useState(me.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  const profile = useMutation({
    mutationFn: () => api.patch('/auth/me', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
  const password = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    onSuccess: () => setPw({ currentPassword: '', newPassword: '', confirm: '' }),
  });

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    if (pw.newPassword !== pw.confirm) return setPwError('As senhas não conferem');
    password.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {me.email} · {ROLE_LABEL[me.role]}
      </p>

      <section className="mt-10 rounded-xl border border-border p-6">
        <h2 className="font-medium">Perfil</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            profile.mutate();
          }}
          className="mt-4 space-y-4"
        >
          <Field label="Nome">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={profile.isPending} disabled={name.trim() === me.name}>
              Salvar
            </Button>
            {profile.isSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <Check className="size-4" /> Salvo
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-border p-6">
        <h2 className="font-medium">Trocar senha</h2>
        <form onSubmit={submitPassword} className="mt-4 space-y-4">
          <Field label="Senha atual">
            <Input required type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres">
            <Input required type="password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirme a nova senha">
            <Input required type="password" minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          {(pwError || password.error) && <p className="text-sm text-red-600">{pwError || (password.error as Error).message}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={password.isPending}>
              Trocar senha
            </Button>
            {password.isSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <Check className="size-4" /> Senha alterada
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
