import { NavLink, Navigate, Outlet } from 'react-router';
import { Bot, Mail, Plug, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLayout } from '@/components/AppLayout';

const TABS = [
  { to: 'general', label: 'Geral', icon: Settings },
  { to: 'users', label: 'Usuários', icon: Users },
  { to: 'ai', label: 'Inteligência Artificial', icon: Bot },
  { to: 'email', label: 'E-mail', icon: Mail },
  { to: 'integrations', label: 'Integrações (MCP)', icon: Plug },
];

export function AdminLayout() {
  const ctx = useLayout();
  if (ctx.me.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
      <p className="mt-1 text-sm text-fg-muted">Configurações da {ctx.me.workspaceName}.</p>
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm text-fg-muted hover:text-fg',
                isActive && 'border-accent font-medium text-fg',
              )
            }
          >
            <t.icon className="size-4" />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="pt-8">
        <Outlet context={ctx} />
      </div>
    </div>
  );
}

export function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-6">
      <h2 className="font-medium">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
}
