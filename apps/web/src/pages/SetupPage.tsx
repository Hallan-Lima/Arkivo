import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export function SetupPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ workspaceName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/setup', form);
      await qc.invalidateQueries();
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Bem-vindo ao Arkivo" subtitle="Configure sua empresa e crie a conta de administrador.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome da empresa">
          <Input required autoFocus value={form.workspaceName} onChange={set('workspaceName')} placeholder="Acme Ltda." />
        </Field>
        <Field label="Seu nome">
          <Input required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="E-mail">
          <Input required type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres">
          <Input required type="password" minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Criar e entrar
        </Button>
      </form>
    </AuthShell>
  );
}
