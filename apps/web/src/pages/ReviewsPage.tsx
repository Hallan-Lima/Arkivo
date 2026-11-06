import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, GitPullRequestArrow } from 'lucide-react';
import { api } from '@/lib/api';
import { useOpenProposals } from '@/lib/hooks';
import { SOURCE_LABEL, type NodeStatus } from '@/lib/types';
import { formatDate, timeAgo, untitled } from '@/lib/utils';
import { useLayout } from '@/components/AppLayout';
import { ProposalDialog } from '@/components/ProposalDialog';
import { StatusBadge } from '@/components/ui';

interface Overdue {
  id: string;
  title: string;
  status: NodeStatus;
  review_due_at: string;
  owner_name: string | null;
  space_slug: string;
  space_name: string;
}

export function ReviewsPage() {
  const { canEdit } = useLayout();
  const { data: proposals = [] } = useOpenProposals();
  const { data: overdue = [] } = useQuery({ queryKey: ['review-queue'], queryFn: () => api.get<Overdue[]>('/review-queue') });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Revisões</h1>
      <p className="mt-1 text-sm text-fg-muted">O que precisa de atenção para a documentação continuar confiável.</p>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <GitPullRequestArrow className="size-4 text-accent" /> Propostas de alteração pendentes
          <span className="rounded-full bg-muted px-2 text-xs font-medium">{proposals.length}</span>
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {proposals.map((p) => (
            <button key={p.id} onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.summary}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {untitled(p.node_title)} · {p.space_name} · {p.author_label ?? SOURCE_LABEL[p.source]} · {timeAgo(p.created_at)}
                </div>
              </div>
              <span className="text-sm font-medium text-accent">Revisar</span>
            </button>
          ))}
          {!proposals.length && <Empty text="Nenhuma proposta pendente." />}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-amber-500" /> Documentos com revisão vencida
          <span className="rounded-full bg-muted px-2 text-xs font-medium">{overdue.length}</span>
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {overdue.map((n) => (
            <Link key={n.id} to={`/s/${n.space_slug}/p/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{untitled(n.title)}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {n.space_name} · responsável: {n.owner_name ?? 'ninguém'} · venceu em {formatDate(n.review_due_at).split(' ')[0]}
                </div>
              </div>
              <StatusBadge status={n.status} />
            </Link>
          ))}
          {!overdue.length && <Empty text="Nenhum documento com revisão vencida." />}
        </div>
      </section>

      {open && <ProposalDialog id={open} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-fg-subtle">
      <CheckCircle2 className="size-4 text-emerald-500" /> {text}
    </div>
  );
}
