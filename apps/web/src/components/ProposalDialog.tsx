import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DiffStats, DiffView } from './DiffView';
import { AlertTriangle, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { markdownToJSON } from '@/lib/markdown';
import { SOURCE_LABEL, type ProposalDetail } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { Button, Dialog, Spinner } from './ui';
import { MarkdownView } from './AiChat';

/** Revisão de uma proposta (IA, MCP): diff + aceitar/rejeitar. */
export function ProposalDialog({
  id,
  canEdit,
  onClose,
  beforeApply,
  onApplied,
}: {
  id: string;
  canEdit: boolean;
  onClose: () => void;
  beforeApply?: () => Promise<void>;
  onApplied?: () => Promise<void> | void;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<'split' | 'changes' | 'preview'>('split');
  const { data: p, isLoading } = useQuery({ queryKey: ['proposal', id], queryFn: () => api.get<ProposalDetail>(`/change-requests/${id}`) });

  const invalidate = (nodeId: string) => {
    qc.invalidateQueries({ queryKey: qk.proposals(nodeId) });
    qc.invalidateQueries({ queryKey: qk.openProposals });
    qc.invalidateQueries({ queryKey: qk.node(nodeId) });
    qc.invalidateQueries({ queryKey: qk.versions(nodeId) });
    qc.invalidateQueries({ queryKey: ['proposal', id] });
  };

  const accept = useMutation({
    mutationFn: async () => {
      await beforeApply?.();
      const content = markdownToJSON(p!.proposed_markdown);
      return api.post(`/change-requests/${id}/accept`, { content, ...(p!.proposed_title ? { title: p!.proposed_title } : {}) });
    },
    onSuccess: async () => {
      invalidate(p!.node_id);
      await onApplied?.();
      onClose();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/change-requests/${id}/reject`),
    onSuccess: () => {
      invalidate(p!.node_id);
      onClose();
    },
  });

  const outdated = p && p.base_version !== null && p.current_version > p.base_version;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p ? p.summary : 'Proposta de alteração'}
      description={p ? `${p.author_label ?? SOURCE_LABEL[p.source]} · ${formatDate(p.created_at)} · ${p.node_title || 'Sem título'}` : undefined}
      className="max-w-6xl"
    >
      {isLoading || !p ? (
        <Spinner />
      ) : (
        <>
          {p.instruction && (
            <p className="mb-3 rounded-lg bg-surface px-3 py-2 text-sm text-fg-muted">
              <span className="font-medium text-fg">Pedido:</span> {p.instruction}
            </p>
          )}
          {outdated && p.status === 'open' && (
            <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              O documento mudou depois que esta proposta foi criada (v{p.base_version} → v{p.current_version}). Aceitar substitui o conteúdo atual pelo proposto.
            </p>
          )}
          <div className="mb-3 flex items-center gap-1">
            {(
              [
                ['split', 'Alterações'],
                ['changes', 'Apenas alterações'],
                ['preview', 'Como fica'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn('h-8 rounded-md px-2.5 text-sm text-fg-muted hover:text-fg', view === v && 'bg-muted font-medium text-fg')}
              >
                {label}
              </button>
            ))}
            {view !== 'preview' && (
              <span className="ml-2">
                <DiffStats oldText={p.current_markdown} newText={p.proposed_markdown} />
              </span>
            )}
            {p.status !== 'open' && <span className="ml-auto text-sm text-fg-subtle">{p.status === 'accepted' ? 'Aceita' : 'Rejeitada'}</span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
            {view !== 'preview' ? (
              <DiffView oldText={p.current_markdown} newText={p.proposed_markdown} mode={view} oldLabel="Atual" newLabel="Proposta" />
            ) : (
              <div className="p-5">
                {p.proposed_title && <h1 className="mb-3 text-2xl font-bold">{p.proposed_title}</h1>}
                <MarkdownView markdown={p.proposed_markdown} className="prose-base" />
              </div>
            )}
          </div>
          {(accept.error || reject.error) && <p className="mt-2 text-sm text-red-600">{((accept.error || reject.error) as Error).message}</p>}
          {canEdit && p.status === 'open' && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-fg-subtle">Ao aceitar, uma nova versão é criada — dá para desfazer pelo histórico.</span>
              <Button variant="secondary" loading={reject.isPending} onClick={() => reject.mutate()}>
                <X className="size-4" /> Rejeitar
              </Button>
              <Button loading={accept.isPending} onClick={() => accept.mutate()}>
                <Check className="size-4" /> Aceitar alteração
              </Button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
