import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { AuthShell } from './AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ emailEnabled: boolean } | null>(null);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setResult(await api.post<{ ok: boolean; emailEnabled: boolean }>('/auth/forgot-password', { email }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Esqueceu a senha?" subtitle="Informe seu e-mail para receber um link de redefinição.">
      {result ? (
        result.emailEnabled ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
            <p className="text-sm text-fg-muted">
              Se existir uma conta para <strong className="text-fg">{email}</strong>, você receberá um e-mail com o link em instantes. O link vale por 2 horas.
            </p>
            <Link to="/login" className="block text-sm font-medium text-accent hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <MailWarning className="mx-auto size-10 text-amber-500" />
            <p className="text-sm text-fg-muted">
              O envio de e-mails ainda não foi configurado nesta instalação. Peça a um <strong className="text-fg">administrador</strong> para gerar um link de redefinição em
              Administração → Usuários.
            </p>
            <Link to="/login" className="block text-sm font-medium text-accent hover:underline">
              Voltar para o login
            </Link>
          </div>
        )
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input required autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Enviar link
          </Button>
          <Link to="/login" className="block text-center text-sm text-fg-muted hover:text-fg">
            Voltar para o login
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const check = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api.get<{ valid: boolean; email?: string; name?: string }>(`/auth/reset-password/${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('As senhas não conferem');
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      await qc.invalidateQueries();
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (token && check.isLoading) {
    return (
      <AuthShell title="Definir senha" subtitle="Verificando o link…">
        <Spinner className="mx-auto" />
      </AuthShell>
    );
  }

  if (!token || !check.data?.valid) {
    return (
      <AuthShell title="Link inválido" subtitle="Este link expirou ou já foi usado.">
        <div className="space-y-3 text-center text-sm">
          <Link to="/forgot-password" className="block font-medium text-accent hover:underline">
            Pedir um novo link
          </Link>
          <Link to="/login" className="block text-fg-muted hover:text-fg">
            Voltar para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Olá, ${check.data.name?.split(' ')[0] ?? ''}`} subtitle={`Defina uma nova senha para ${check.data.email}.`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Mínimo de 8 caracteres">
          <Input required autoFocus type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirme a senha">
          <Input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Salvar e entrar
        </Button>
      </form>
    </AuthShell>
  );
}
