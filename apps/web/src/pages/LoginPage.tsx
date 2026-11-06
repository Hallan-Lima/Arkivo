import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { email, password });
      await qc.invalidateQueries();
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Entrar no Arkivo" subtitle="Acesse a documentação da sua empresa.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <Input required autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 flex justify-end">
          <Link to="/forgot-password" className="text-xs text-fg-muted hover:text-accent">
            Esqueci minha senha
          </Link>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
