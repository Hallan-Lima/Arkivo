import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronRight, CloudOff, FileSearch, FileText, GitPullRequestArrow, Loader2, PanelRight, Printer, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { qk, useDesigns, useNode, useTree } from '@/lib/hooks';
import type { Design, NodeDetail, TreeItem } from '@/lib/types';
import { designStyle, fileUrl, layoutWidth } from '@/lib/design';
import { ancestors, cn, timeAgo, untitled } from '@/lib/utils';
import { Editor } from '@/editor/Editor';
import { Spinner, StatusBadge } from '@/components/ui';
import { useLayout } from '@/components/AppLayout';
import { DocSidePanel, type PanelTab } from '@/components/DocSidePanel';
import { ProposalDialog } from '@/components/ProposalDialog';
import { FileViewer } from '@/components/FileViewer';
import { useProposals } from '@/lib/hooks';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function DocPage() {
  const { nodeId = '' } = useParams();
  const { data: node, isLoading, error, refetch } = useNode(nodeId);
  const [reloadKey, setReloadKey] = useState(0);

  if (isLoading) return <div className="grid h-full place-items-center"><Spinner /></div>;
  if (error || !node) return <div className="p-10 text-sm text-fg-muted">Documento não encontrado.</div>;

  return (
    <DocView
      key={`${node.id}:${reloadKey}`}
      node={node}
      onReload={async () => {
        await refetch();
        setReloadKey((k) => k + 1);
      }}
    />
  );
}

function DocView({ node, onReload }: { node: NodeDetail; onReload: () => Promise<void> }) {
  const { canEdit } = useLayout();
  const [params, setParams] = useSearchParams();
  const [panelTab, setPanelTab] = useState<PanelTab>('info');
  const [proposalId, setProposalId] = useState<string | null>(() => params.get('proposal'));
  const { data: designs = [] } = useDesigns();
  const design = designs.find((d) => d.id === node.design_id) ?? null;

  // Vindo de uma citação da IA (?hl=trecho): rola até o trecho e destaca.
  const hl = params.get('hl');
  useEffect(() => {
    if (!hl && !params.get('proposal')) return;
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    // O editor e o painel ainda estão montando: tenta por alguns segundos até achar o trecho.
    const attempt = () => {
      const found = !hl || flashSnippet(hl);
      if (!found && ++tries < 25) {
        t = setTimeout(attempt, 200);
        return;
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('hl');
          next.delete('proposal');
          return next;
        },
        { replace: true },
      );
    };
    t = setTimeout(attempt, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hl]);
  const { data: proposals = [] } = useProposals(node.id);
  const openProposals = proposals.filter((p) => p.status === 'open');
  const qc = useQueryClient();
  const { data: tree = [] } = useTree(node.space_id);
  const [title, setTitle] = useState(node.title);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('arkivo:panel') !== '0';
    } catch {
      return true;
    }
  });

  const pending = useRef<{ title?: string; content?: Record<string, unknown> }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setSaveState('saving');
    try {
      await api.patch(`/nodes/${node.id}`, patch);
      setSaveState('saved');
      if (patch.title !== undefined) {
        qc.setQueryData<TreeItem[]>(qk.tree(node.space_id), (old) => old?.map((n) => (n.id === node.id ? { ...n, title: patch.title! } : n)));
      }
      qc.invalidateQueries({ queryKey: qk.versions(node.id) });
    } catch {
      pending.current = { ...patch, ...pending.current };
      setSaveState('error');
    }
  }, [node.id, node.space_id, qc]);

  const schedule = useCallback(
    (patch: { title?: string; content?: Record<string, unknown> }) => {
      pending.current = { ...pending.current, ...patch };
      setSaveState('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  // Salva o que estiver pendente ao sair da página.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      void flush();
    };
  }, [flush]);

  const openPanel = (t: PanelTab) => {
    setPanelTab(t);
    if (!panelOpen) togglePanel();
  };

  const togglePanel = () => {
    setPanelOpen((o) => {
      try {
        localStorage.setItem('arkivo:panel', o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };

  // Arquivo original importado (PDF, Word, PowerPoint…) para ver o layout exato.
  const original = node.files.find((f) => f.kind === 'original') ?? null;
  const viewKey = `arkivo:view:${node.id}`;
  const [view, setView] = useState<'doc' | 'original'>(() => {
    try {
      return localStorage.getItem(viewKey) === 'original' ? 'original' : 'doc';
    } catch {
      return 'doc';
    }
  });
  const changeView = (v: 'doc' | 'original') => {
    setView(v);
    try {
      localStorage.setItem(viewKey, v);
    } catch {
      /* ignore */
    }
  };

  const path = ancestors(tree, node.id).slice(0, -1);
  const children = tree.filter((t) => t.parent_id === node.id).sort((a, b) => a.position - b.position);
  const overdue = node.review_due_at && new Date(node.review_due_at) < new Date();

  return (
    <div className="print-scroll flex h-full">
      <div className="print-scroll min-w-0 flex-1 overflow-y-auto">
        <header className="no-print sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-transparent bg-bg/85 px-5 backdrop-blur">
          <nav className="flex min-w-0 items-center gap-1 text-sm text-fg-muted">
            <Link to={`/s/${node.space_slug}`} className="truncate hover:text-fg">{node.space_name}</Link>
            {path.map((p) => (
              <span key={p.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
                <Link to={`/s/${node.space_slug}/p/${p.id}`} className="truncate hover:text-fg">{untitled(p.title)}</Link>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {original && (
              <div className="flex rounded-lg bg-muted p-0.5 text-sm">
                <button onClick={() => changeView('doc')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-fg-muted', view === 'doc' && 'bg-bg font-medium text-fg shadow-sm')}>
                  <FileText className="size-3.5" /> Documento
                </button>
                <button
                  onClick={() => changeView('original')}
                  className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-fg-muted', view === 'original' && 'bg-bg font-medium text-fg shadow-sm')}
                  title={`Ver ${original.name} exatamente como foi importado`}
                >
                  <FileSearch className="size-3.5" /> Original
                </button>
              </div>
            )}
            <SaveIndicator state={saveState} />
            <button onClick={() => window.print()} className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg" title="Imprimir / salvar em PDF">
              <Printer className="size-4" />
            </button>
            <StatusBadge status={node.status} />
            <button
              onClick={() => (panelOpen && panelTab === 'ai' ? togglePanel() : openPanel('ai'))}
              className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:bg-muted hover:text-fg', panelOpen && panelTab === 'ai' && 'bg-accent-soft text-accent')}
              title="Chat com IA"
            >
              <Sparkles className="size-4" /> Chat
            </button>
            <button onClick={togglePanel} className={cn('grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg', panelOpen && 'bg-muted text-fg')} title="Detalhes e histórico">
              <PanelRight className="size-4" />
            </button>
          </div>
        </header>

        {original && view === 'original' && (
          <div className="h-[calc(100%-3rem)] p-4">
            <FileViewer file={original} nodeId={node.id} canEdit={canEdit} className="h-full" />
          </div>
        )}
        {/* O editor continua montado (só escondido) para não perder edições em andamento. */}
        <article
          className={cn('mx-auto px-6 pb-24 pt-10 lg:px-10', layoutWidth(design?.layout), view === 'original' && original && 'hidden', design && `doc-design layout-${design.layout}`)}
          style={design ? designStyle(design) : undefined}
        >
          {openProposals.length > 0 && (
            <button
              onClick={() => setProposalId(openProposals[0].id)}
              className="no-print mb-4 flex w-full items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-left text-sm"
            >
              <GitPullRequestArrow className="size-4 shrink-0 text-accent" />
              <span className="flex-1">
                {openProposals.length === 1 ? 'Há 1 proposta de alteração aguardando revisão' : `Há ${openProposals.length} propostas de alteração aguardando revisão`}
                <span className="text-fg-muted"> — {openProposals[0].summary}</span>
              </span>
              <span className="font-medium text-accent">Revisar</span>
            </button>
          )}
          {overdue && (
            <div className="no-print mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              A revisão deste documento venceu. Confira se o conteúdo ainda está correto.
            </div>
          )}
          <div className={cn(design && 'doc-design-paper overflow-hidden')}>
          {design && <DesignHeader design={design} />}
          <div className={cn(design && 'px-6 pb-10 pt-8 sm:px-12')}>
          <TitleInput
            value={title}
            readOnly={!canEdit}
            onChange={(v) => {
              setTitle(v);
              schedule({ title: v });
            }}
          />
          <p className="doc-design-meta mb-8 mt-2 text-xs text-fg-subtle">
            {node.updated_by_name ? `Editado por ${node.updated_by_name} ` : 'Editado '}
            {timeAgo(node.updated_at)} · versão {node.version}
          </p>
          <Editor content={node.content} editable={canEdit} onChange={(content) => schedule({ content })} />
          </div>
          {design?.footer_text && (
            <footer className="border-t px-6 py-4 text-xs sm:px-12" style={{ borderColor: 'color-mix(in srgb, var(--d-primary) 25%, transparent)', color: 'var(--d-muted)' }}>
              {design.footer_text}
            </footer>
          )}
          </div>

          {children.length > 0 && (
            <section className="no-print mt-12 border-t border-border pt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Subpáginas</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {children.map((c) => (
                  <Link key={c.id} to={`/s/${node.space_slug}/p/${c.id}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted">
                    {c.icon ?? <FileText className="size-4 text-fg-subtle" />}
                    <span className="truncate">{untitled(c.title)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>

      {panelOpen && (
        <DocSidePanel
          node={node}
          canEdit={canEdit}
          tab={panelTab}
          onTab={setPanelTab}
          beforeRestore={flush}
          onRestored={onReload}
          onOpenProposal={setProposalId}
        />
      )}
      {proposalId && <ProposalDialog id={proposalId} canEdit={canEdit} onClose={() => setProposalId(null)} beforeApply={flush} onApplied={onReload} />}
    </div>
  );
}

function TitleInput({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (!value && !readOnly) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      placeholder="Sem título"
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (document.querySelector('.arkivo-editor .ProseMirror') as HTMLElement | null)?.focus();
        }
      }}
      className="doc-title w-full resize-none overflow-hidden bg-transparent text-4xl font-bold leading-tight tracking-tight outline-none placeholder:text-fg-subtle/60"
    />
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map = {
    pending: { icon: <Loader2 className="size-3.5 animate-spin" />, text: 'Editando…' },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: 'Salvando…' },
    saved: { icon: <Check className="size-3.5" />, text: 'Salvo' },
    error: { icon: <CloudOff className="size-3.5" />, text: 'Erro ao salvar' },
  } as const;
  const s = map[state];
  return (
    <span className={cn('flex items-center gap-1.5 text-xs', state === 'error' ? 'text-red-600' : 'text-fg-subtle')}>
      {s.icon}
      {s.text}
    </span>
  );
}

/** Faixa do design: logo + texto de cabeçalho; no layout "relatório", uma capa com a cor principal. */
function DesignHeader({ design }: { design: Design }) {
  const logo = fileUrl(design.logo_file_id);
  const cover = fileUrl(design.cover_file_id);
  if (design.layout === 'report') {
    return (
      <div className="relative text-white" style={{ background: 'var(--d-primary)' }}>
        {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-35" />}
        {/* O título editável fica logo abaixo; a capa mostra só a identidade visual. */}
        <div className="relative flex min-h-28 items-start justify-between gap-4 px-6 py-6 text-xs uppercase tracking-wider sm:px-12">
          {logo ? <img src={logo} alt="" className="h-10 max-w-48 object-contain" /> : <span />}
          {design.header_text && <span className="opacity-90">{design.header_text}</span>}
        </div>
        <div className="h-1.5" style={{ background: 'var(--d-accent)' }} />
      </div>
    );
  }
  if (!logo && !design.header_text && !cover) return <div className="h-1.5" style={{ background: 'var(--d-primary)' }} />;
  return (
    <>
      {cover && <img src={cover} alt="" className="h-40 w-full object-cover" />}
      <div className="flex items-center justify-between gap-4 border-b-4 px-6 py-4 sm:px-12" style={{ borderColor: 'var(--d-primary)' }}>
        {logo ? <img src={logo} alt="" className="h-9 max-w-44 object-contain" /> : <span />}
        {design.header_text && (
          <span className="text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--d-muted)' }}>
            {design.header_text}
          </span>
        )}
      </div>
    </>
  );
}

/** Encontra no editor o bloco que contém o trecho citado, rola até ele e destaca. */
function flashSnippet(snippet: string): boolean {
  const norm = (t: string) =>
    t
      .replace(/[*_`#>|[\]()~=]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const words = norm(snippet).split(' ').filter(Boolean);
  const root = document.querySelector('.arkivo-editor .ProseMirror') ?? document.querySelector('.ProseMirror');
  if (!root || words.length < 2) return false;
  const blocks = [...root.querySelectorAll('p, li, td, th, h1, h2, h3, h4, pre, blockquote')];
  const texts = blocks.map((b) => norm(b.textContent ?? ''));
  for (const size of [6, 4, 3]) {
    for (let start = 0; start + size <= words.length; start += 2) {
      const probe = words.slice(start, start + size).join(' ');
      if (probe.length < 10) continue;
      const i = texts.findIndex((t) => t.includes(probe));
      if (i >= 0) {
        const el = blocks[i] as HTMLElement;
        el.scrollIntoView({ block: 'center' });
        el.classList.add('cite-flash');
        setTimeout(() => el.classList.remove('cite-flash'), 2600);
        return true;
      }
    }
  }
  return false;
}
