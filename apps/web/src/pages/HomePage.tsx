import { Link } from 'react-router';
import { FileUp, FolderPlus, Layers, Sparkles } from 'lucide-react';
import { useSpaces } from '@/lib/hooks';
import { useLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui';

export function HomePage() {
  const { me, openNewSpace } = useLayout();
  const { data: spaces = [], isLoading } = useSpaces();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        {greeting}, {me.name.split(' ')[0]}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">Toda a documentação da {me.workspaceName} em um só lugar.</p>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Espaços</h2>
        {me.role === 'admin' && spaces.length > 0 && (
          <Button size="sm" variant="secondary" onClick={openNewSpace}>
            <FolderPlus className="size-4" /> Novo espaço
          </Button>
        )}
      </div>

      {!isLoading && !spaces.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <Layers className="mx-auto size-8 text-fg-subtle" />
          <h3 className="mt-3 font-medium">Crie o primeiro espaço</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            Espaços organizam a documentação por área — por exemplo “Infraestrutura”, “Banco de Dados” ou “Service Desk”.
          </p>
          {me.role === 'admin' ? (
            <Button className="mt-5" onClick={openNewSpace}>
              <FolderPlus className="size-4" /> Novo espaço
            </Button>
          ) : (
            <p className="mt-4 text-xs text-fg-subtle">Peça a um administrador para criar um espaço.</p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <Link key={s.id} to={`/s/${s.slug}`} className="group rounded-xl border border-border p-4 transition hover:border-fg-subtle hover:shadow-sm">
              <div className="grid size-10 place-items-center rounded-lg text-lg" style={{ background: s.color ?? 'var(--accent-soft)' }}>
                {s.icon ?? s.name.slice(0, 1)}
              </div>
              <div className="mt-3 font-medium">{s.name}</div>
              <p className="mt-0.5 line-clamp-2 min-h-10 text-sm text-fg-muted">{s.description || 'Sem descrição'}</p>
              <div className="mt-3 text-xs text-fg-subtle">{s.nodeCount ?? 0} documento(s)</div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        <Link to="/import" className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm hover:border-fg-subtle">
          <FileUp className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <div className="font-medium">Importar documentação antiga</div>
            <p className="mt-0.5 text-fg-muted">Word, PDF, Markdown, HTML, Excel e scripts viram páginas editáveis — com o original anexado.</p>
          </div>
        </Link>
        <Link to={me.features.ai ? '/assistant' : me.role === 'admin' ? '/admin/ai' : '/'} className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm hover:border-fg-subtle">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <div className="font-medium">{me.features.ai ? 'Perguntar ao assistente' : 'Assistente de IA'}</div>
            <p className="mt-0.5 text-fg-muted">
              {me.features.ai
                ? 'Tire dúvidas com base na documentação, com as fontes citadas.'
                : me.role === 'admin'
                  ? 'Conecte um provedor de IA (nuvem ou local) para habilitar o chat e as propostas de alteração.'
                  : 'Ainda não habilitado pelo administrador.'}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
