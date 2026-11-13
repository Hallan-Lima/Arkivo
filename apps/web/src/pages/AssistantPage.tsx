import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bot, Database, ListChecks, Wand2 } from 'lucide-react';
import { useLayout } from '@/components/AppLayout';
import { AiChat } from '@/components/AiChat';
import { Studio } from '@/components/Studio';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { docsLabel, hasSelection, scopeActions, useScopeState, useScopeSummary } from '@/lib/scope';
import { cn } from '@/lib/utils';

interface IndexStatus {
  docs: number;
  pending: number;
  chunks: number;
  embedded: number;
  semantic: boolean;
  embeddingModel: string | null;
  embeddingError: string | null;
}

/**
 * Notebook de IA, no formato do NotebookLM:
 * fontes (a árvore de espaços, à esquerda) · conversa (centro) · Estúdio (direita).
 */
export function AssistantPage() {
  const { me } = useLayout();
  const scope = useScopeState();
  const { data: summary } = useScopeSummary(me.features.ai);
  const { data: status } = useQuery({
    queryKey: qk.notebookStatus,
    queryFn: () => api.get<IndexStatus>('/notebook/status'),
    enabled: me.features.ai,
    refetchInterval: (q) => (q.state.data && (q.state.data.pending > 0 || (q.state.data.semantic && q.state.data.embedded < q.state.data.chunks)) ? 4000 : 60_000),
  });

  if (!me.features.ai) {
    return (
      <div className="mx-auto max-w-lg px-8 py-24 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent-soft text-accent">
          <Bot className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Notebook de IA desativado</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {me.role === 'admin' ? (
            <>
              Conecte um provedor (OpenAI, Anthropic, Ollama local…) em{' '}
              <Link to="/admin/ai" className="font-medium text-accent hover:underline">
                Administração → Inteligência Artificial
              </Link>
              .
            </>
          ) : (
            'Peça a um administrador para conectar um provedor de IA.'
          )}
        </p>
      </div>
    );
  }

  const indexing = status && (status.pending > 0 || (status.semantic && status.embedded < status.chunks));

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col px-6 py-6">
        <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
          <div className="mb-3 shrink-0">
            <h1 className="text-xl font-semibold tracking-tight">Notebook</h1>
            <p className="text-sm text-fg-muted">
              Pergunte, gere conteúdos e encontre o que está desatualizado usando a documentação da {me.workspaceName} como fonte.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => scopeActions.togglePicking()}
                className={cn('flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-fg-muted hover:border-accent hover:text-fg', scope.picking && 'border-accent bg-accent-soft text-accent')}
              >
                <ListChecks className="size-3.5" />
                {summary ? (hasSelection(scope) ? `${summary.included} de ${docsLabel(summary.total - summary.blocked)} selecionados` : `Todas as fontes (${docsLabel(summary.total - summary.blocked)})`) : 'Fontes'}
                <span className="text-fg-subtle">· {scope.picking ? 'marque na árvore à esquerda' : 'escolher'}</span>
              </button>
              {status && (
                <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-fg-muted" title={status.embeddingError ?? undefined}>
                  <Database className="size-3.5" />
                  {indexing ? `Indexando… ${status.docs - status.pending}/${status.docs} docs` : `${status.chunks} trechos indexados`}
                  {' · '}
                  {status.semantic ? (status.embeddingError ? 'busca semântica com erro' : 'busca híbrida') : 'busca por palavras'}
                </span>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <AiChat
              storageKey="arkivo:chat:global"
              title="Conversa com as fontes"
              suggestions={['Resuma os principais procedimentos', 'Quais regras se repetem entre os documentos?', 'Existe alguma informação conflitante entre as fontes?']}
            />
          </div>
        </div>
      </section>
      <aside className="flex w-[22rem] shrink-0 flex-col border-l border-border bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="size-4 text-accent" /> Estúdio
        </h2>
        <div className="min-h-0 flex-1">
          <Studio storageKey="arkivo:studio:global" />
        </div>
      </aside>
    </div>
  );
}
