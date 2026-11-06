import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DiffStats, DiffView } from './DiffView';
import { jsonToMarkdown } from '@/lib/markdown';
import { Bookmark, Bot, Columns2, Download, FileText, History, Info, ListCollapse as ListDiff, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, qk, useProposals, useUsers, useVersions } from '@/lib/hooks';
import { SOURCE_LABEL, STATUS_LABEL, type NodeDetail, type NodeStatus, type VersionDetail } from '@/lib/types';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { Editor } from '@/editor/Editor';
import { Button, Dialog, Field, Input, Select, Spinner } from './ui';
import { AiChat } from './AiChat';
import { useLayout } from './AppLayout';

export type PanelTab = 'info' | 'history' | 'ai';

export function DocSidePanel({
  node,
  canEdit,
  tab,
  onTab,
  beforeRestore,
  onRestored,
  onOpenProposal,
}: {
  node: NodeDetail;
  canEdit: boolean;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  beforeRestore: () => Promise<void>;
  onRestored: () => Promise<void>;
  onOpenProposal: (id: string) => void;
}) {
  const { me } = useLayout();
  const qc = useQueryClient();
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem('arkivo:panel-width')) || 360;
    } catch {
      return 360;
    }
  });

  // Arrastar a borda esquerda redimensiona o painel (como no Claude/ChatGPT).
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let latest = startW;
    const move = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startW + (startX - ev.clientX), 300), Math.min(760, window.innerWidth - 420));
      setWidth(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('arkivo:panel-width', String(latest));
      } catch {
        /* ignore */
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-border bg-surface" style={{ width }}>
      <div
        onPointerDown={startResize}
        onDoubleClick={() => setWidth(360)}
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-accent/30"
        title="Arraste para redimensionar"
      />
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <TabBtn active={tab === 'ai'} onClick={() => onTab('ai')} icon={<Sparkles className="size-4" />} label="Chat" />
        <TabBtn active={tab === 'info'} onClick={() => onTab('info')} icon={<Info className="size-4" />} label="Detalhes" />
        <TabBtn active={tab === 'history'} onClick={() => onTab('history')} icon={<History className="size-4" />} label="Histórico" />
      </div>
      <div className={cn('min-h-0 flex-1', tab === 'ai' ? 'flex flex-col px-3 pb-3 pt-1' : 'overflow-y-auto p-4')}>
        {tab === 'info' && <InfoTab node={node} canEdit={canEdit} />}
        {tab === 'history' && <HistoryTab node={node} canEdit={canEdit} beforeRestore={beforeRestore} onRestored={onRestored} onOpenProposal={onOpenProposal} />}
        {tab === 'ai' &&
          (me.features.ai ? (
            <AiChat
              key={node.id}
              nodeId={node.id}
              compact
              storageKey={`arkivo:chat:${node.id}`}
              suggestions={['Resuma este documento', 'Quais são os passos principais?', 'O que está faltando neste documento?']}
              editSuggestions={['Corrija ortografia e gramática', 'Organize em seções com títulos claros', 'Transforme em um procedimento passo a passo']}
              onPropose={
                canEdit && me.features.aiProposals
                  ? async (instruction) => {
                      const p = await api.post<{ id: string; summary: string }>('/ai/propose', { nodeId: node.id, instruction });
                      qc.invalidateQueries({ queryKey: qk.proposals(node.id) });
                      qc.invalidateQueries({ queryKey: qk.openProposals });
                      return p;
                    }
                  : undefined
              }
              onOpenProposal={onOpenProposal}
            />
          ) : (
            <ChatSetup isAdmin={me.role === 'admin'} />
          ))}
      </div>
    </aside>
  );
}

/** Mostrado na aba Chat enquanto nenhum provedor de IA foi configurado. */
function ChatSetup({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Bot className="size-6" />
      </div>
      <h3 className="mt-4 font-medium">Chat com IA</h3>
      <p className="mt-1.5 text-sm text-fg-muted">
        Converse sobre este documento, peça resumos ou peça alterações — que viram propostas para você aprovar.
      </p>
      {isAdmin ? (
        <Link to="/admin/ai" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">
          <Sparkles className="size-4" /> Conectar um provedor de IA
        </Link>
      ) : (
        <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-fg-muted">Ainda não habilitado. Peça a um administrador para conectar um provedor de IA.</p>
      )}
      <p className="mt-4 text-xs text-fg-subtle">Funciona com OpenAI, Anthropic, Ollama (local) e outros compatíveis.</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:text-fg', active && 'bg-muted font-medium text-fg')}>
      {icon}
      {label}
    </button>
  );
}

function InfoTab({ node, canEdit }: { node: NodeDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: users = [] } = useUsers();
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/nodes/${node.id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.node(node.id) });
      qc.invalidateQueries({ queryKey: qk.tree(node.space_id) });
    },
  });

  const reviewDate = node.review_due_at ? node.review_due_at.slice(0, 10) : '';

  return (
    <div className="space-y-5">
      <Field label="Status">
        <Select disabled={!canEdit} value={node.status} onChange={(e) => update.mutate({ status: e.target.value as NodeStatus })}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsável" hint="Quem responde pelo conteúdo e recebe os avisos de revisão.">
        <Select disabled={!canEdit} value={node.owner_id ?? ''} onChange={(e) => update.mutate({ ownerId: e.target.value || null })}>
          <option value="">— Ninguém —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Revisar até" hint="Depois desta data o documento aparece como pendente de revisão.">
        <Input
          type="date"
          disabled={!canEdit}
          value={reviewDate}
          onChange={(e) => update.mutate({ reviewDueAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })}
        />
      </Field>
      <dl className="space-y-2 border-t border-border pt-4 text-sm">
        <Row k="Criado em" v={formatDate(node.created_at)} />
        <Row k="Atualizado" v={`${timeAgo(node.updated_at)}${node.updated_by_name ? ` por ${node.updated_by_name}` : ''}`} />
        <Row k="Versão atual" v={`v${node.version}`} />
        <Row k="Espaço" v={node.space_name} />
      </dl>
      {node.files.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-medium">Arquivos</div>
          <div className="space-y-1.5">
            {node.files.map((f) => (
              <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm hover:bg-muted">
                <FileText className="size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{f.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {f.kind === 'original' ? 'Original importado' : 'Anexo'} · {formatBytes(f.size)}
                  </span>
                </span>
                <Download className="size-4 shrink-0 text-fg-subtle" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-subtle">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

function HistoryTab({
  node,
  canEdit,
  beforeRestore,
  onRestored,
  onOpenProposal,
}: {
  node: NodeDetail;
  canEdit: boolean;
  beforeRestore: () => Promise<void>;
  onRestored: () => Promise<void>;
  onOpenProposal: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: versions = [], isLoading } = useVersions(node.id);
  const { data: proposals = [] } = useProposals(node.id);
  const [selected, setSelected] = useState<number | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [message, setMessage] = useState('');

  const checkpoint = useMutation({
    mutationFn: async () => {
      await beforeRestore();
      return api.post(`/nodes/${node.id}/versions`, { message });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.versions(node.id) });
      qc.invalidateQueries({ queryKey: qk.node(node.id) });
      setCheckpointOpen(false);
      setMessage('');
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <Button variant="secondary" size="sm" className="mb-4 w-full" onClick={() => setCheckpointOpen(true)}>
          <Bookmark className="size-4" /> Salvar versão nomeada
        </Button>
      )}
      {proposals.length > 0 && (
        <div className="mb-5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Propostas</div>
          <div className="space-y-1">
            {proposals.map((p) => (
              <button key={p.id} onClick={() => onOpenProposal(p.id)} className="w-full rounded-md border border-border px-2.5 py-2 text-left hover:bg-muted">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{p.summary}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      p.status === 'open' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                      p.status === 'accepted' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                      p.status === 'rejected' && 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
                    )}
                  >
                    {p.status === 'open' ? 'Pendente' : p.status === 'accepted' ? 'Aceita' : 'Rejeitada'}
                  </span>
                </div>
                <div className="text-xs text-fg-subtle">
                  {p.author_label ?? SOURCE_LABEL[p.source]} · {timeAgo(p.created_at)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Versões</div>
      <ol className="relative space-y-1 border-l border-border pl-4">
        {versions.map((v) => (
          <li key={v.version}>
            <span className="absolute -left-[5px] mt-2.5 size-2.5 rounded-full border-2 border-surface bg-fg-subtle" />
            <button onClick={() => setSelected(v.version)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">v{v.version}</span>
                <span className="text-xs text-fg-subtle">{timeAgo(v.updated_at)}</span>
              </div>
              {v.message && <div className="text-xs text-accent">{v.message}</div>}
              <div className="text-xs text-fg-subtle">{v.author_name ?? 'Usuário removido'}</div>
            </button>
          </li>
        ))}
      </ol>

      {selected !== null && (
        <VersionDialog
          nodeId={node.id}
          version={selected}
          canRestore={canEdit && selected !== versions[0]?.version}
          onClose={() => setSelected(null)}
          beforeRestore={beforeRestore}
          onRestored={async () => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: qk.versions(node.id) });
            qc.invalidateQueries({ queryKey: qk.tree(node.space_id) });
            await onRestored();
          }}
        />
      )}

      <Dialog open={checkpointOpen} onOpenChange={setCheckpointOpen} title="Salvar versão nomeada" description="Marca o estado atual do documento, ex.: “Revisado pela equipe de infra”.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            checkpoint.mutate();
          }}
          className="space-y-4"
        >
          <Input autoFocus required maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Descrição da versão" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCheckpointOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={checkpoint.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function VersionDialog({
  nodeId,
  version,
  canRestore,
  onClose,
  beforeRestore,
  onRestored,
}: {
  nodeId: string;
  version: number;
  canRestore: boolean;
  onClose: () => void;
  beforeRestore: () => Promise<void>;
  onRestored: () => Promise<void>;
}) {
  const [view, setView] = useState<'split' | 'changes' | 'content'>('split');
  const current = useQuery({ queryKey: ['version', nodeId, version], queryFn: () => api.get<VersionDetail>(`/nodes/${nodeId}/versions/${version}`) });
  const previous = useQuery({
    queryKey: ['version', nodeId, version - 1],
    queryFn: () => api.get<VersionDetail>(`/nodes/${nodeId}/versions/${version - 1}`),
    enabled: version > 1,
  });
  const restore = useMutation({
    mutationFn: async () => {
      await beforeRestore();
      return api.post(`/nodes/${nodeId}/versions/${version}/restore`);
    },
    onSuccess: onRestored,
  });

  const v = current.data;
  const ready = v && (version === 1 || previous.data);
  // Compara em Markdown: preserva títulos, listas e código, linha a linha.
  const toText = (d?: VersionDetail) => (d ? `# ${d.title || 'Sem título'}\n\n${jsonToMarkdown(d.content)}` : '');
  const prevText = useMemo(() => (version > 1 ? toText(previous.data) : ''), [previous.data, version]);
  const curText = useMemo(() => toText(v), [v]);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Versão ${version}`}
      description={v ? `${v.author_name ?? 'Usuário removido'} · ${formatDate(v.created_at)}${v.message ? ` · ${v.message}` : ''}` : undefined}
      className="max-w-6xl"
    >
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <TabBtn active={view === 'split'} onClick={() => setView('split')} icon={<Columns2 className="size-4" />} label="Alterações" />
        <TabBtn active={view === 'changes'} onClick={() => setView('changes')} icon={<ListDiff className="size-4" />} label="Apenas alterações" />
        <TabBtn active={view === 'content'} onClick={() => setView('content')} icon={<FileText className="size-4" />} label="Conteúdo completo" />
        {ready && view !== 'content' && (
          <span className="ml-2 flex items-center gap-2 text-xs text-fg-subtle">
            {version > 1 ? `v${version - 1} → v${version}` : 'primeira versão'} <DiffStats oldText={prevText} newText={curText} />
          </span>
        )}
        {canRestore && (
          <Button size="sm" className="ml-auto" loading={restore.isPending} onClick={() => restore.mutate()}>
            <RotateCcw className="size-4" /> Restaurar esta versão
          </Button>
        )}
      </div>
      <div className={cn('max-h-[65vh] overflow-y-auto rounded-lg border border-border', view === 'content' && 'p-5')}>
        {!ready ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : view === 'content' ? (
          <>
            <h1 className="mb-4 text-2xl font-bold">{v.title || 'Sem título'}</h1>
            <Editor content={v.content} editable={false} />
          </>
        ) : (
          <DiffView oldText={prevText} newText={curText} mode={view} oldLabel={version > 1 ? `Versão ${version - 1}` : '(vazio)'} newLabel={`Versão ${version}`} />
        )}
      </div>
      {restore.error && <p className="mt-2 text-sm text-red-600">{(restore.error as Error).message}</p>}
    </Dialog>
  );
}
