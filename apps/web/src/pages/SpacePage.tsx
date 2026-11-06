import { Link, useNavigate, useParams } from 'react-router';
import { FileText, FileUp, Plus } from 'lucide-react';
import { useCreateNode, useSpace, useTree } from '@/lib/hooks';
import { useLayout } from '@/components/AppLayout';
import { Button, Spinner, StatusBadge } from '@/components/ui';
import { untitled } from '@/lib/utils';
import type { NodeStatus } from '@/lib/types';

export function SpacePage() {
  const { slug = '' } = useParams();
  const { canEdit } = useLayout();
  const nav = useNavigate();
  const { data: space, isLoading, error } = useSpace(slug);
  const { data: tree = [] } = useTree(space?.id);
  const create = useCreateNode();

  if (isLoading) return <div className="grid h-full place-items-center"><Spinner /></div>;
  if (error || !space) return <div className="p-10 text-sm text-fg-muted">Espaço não encontrado.</div>;

  const roots = tree.filter((n) => !n.parent_id).sort((a, b) => a.position - b.position);
  const counts = tree.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.status]: (acc[n.status] ?? 0) + 1 }), {});

  async function newPage() {
    const node = await create.mutateAsync({ spaceId: space!.id });
    nav(`/s/${space!.slug}/p/${node.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: space.color ?? 'var(--accent-soft)' }}>
          {space.icon ?? space.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{space.name}</h1>
          {space.description && <p className="mt-1 text-sm text-fg-muted">{space.description}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => nav(`/import?space=${space.slug}`)}>
              <FileUp className="size-4" /> Importar
            </Button>
            <Button onClick={newPage} loading={create.isPending}>
              <Plus className="size-4" /> Nova página
            </Button>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted">{tree.length} documento(s)</span>
        {(Object.entries(counts) as [NodeStatus, number][]).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <StatusBadge status={s} /> {c}
          </span>
        ))}
      </div>

      <div className="mt-6 divide-y divide-border rounded-xl border border-border">
        {roots.map((n) => {
          const kids = tree.filter((t) => t.parent_id === n.id).length;
          return (
            <Link key={n.id} to={`/s/${space.slug}/p/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              {n.icon ? <span>{n.icon}</span> : <FileText className="size-4 text-fg-subtle" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{untitled(n.title)}</span>
              {kids > 0 && <span className="text-xs text-fg-subtle">{kids} subpágina(s)</span>}
              <StatusBadge status={n.status} />
            </Link>
          );
        })}
        {!roots.length && (
          <div className="px-4 py-12 text-center text-sm text-fg-muted">
            Este espaço ainda não tem páginas.
            {canEdit && (
              <button onClick={newPage} className="ml-1 font-medium text-accent hover:underline">
                Criar a primeira
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
