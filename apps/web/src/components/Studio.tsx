import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookMarked,
  CalendarClock,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FilePlus2,
  FileSearch,
  FileText,
  GitPullRequestArrow,
  GraduationCap,
  HelpCircle,
  Loader2,
  Network,
  Newspaper,
  RefreshCw,
  Save,
  ScrollText,
  Trash2,
  Wand2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { qk, useDesigns, useSpaces } from '@/lib/hooks';
import { markdownToJSON } from '@/lib/markdown';
import { useScope } from '@/lib/scope';
import type { AuditFinding, AuditResult, ChatSource, StudioKind, StudioResult } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Button, Dialog, Field, Select, Textarea } from './ui';
import { MarkdownView, SourceList, citationHref } from './AiChat';
import { useLayout } from './AppLayout';

const TOOLS: { kind: StudioKind; label: string; icon: typeof FileText; ask?: boolean; hint: string }[] = [
  { kind: 'summary', label: 'Resumo', icon: ScrollText, hint: 'Visão geral e pontos principais das fontes.' },
  { kind: 'briefing', label: 'Briefing', icon: Newspaper, hint: 'Contexto, decisões e riscos para entender rápido.' },
  { kind: 'faq', label: 'Perguntas frequentes', icon: HelpCircle, hint: 'As dúvidas que as pessoas teriam, já respondidas.' },
  { kind: 'study_guide', label: 'Guia de estudo', icon: GraduationCap, hint: 'Conceitos, questionário e gabarito.' },
  { kind: 'timeline', label: 'Linha do tempo', icon: CalendarClock, hint: 'Datas, prazos e mudanças em ordem.' },
  { kind: 'mindmap', label: 'Mapa mental', icon: Network, hint: 'Temas e subtemas das fontes.' },
  { kind: 'report', label: 'Relatório', icon: ClipboardList, ask: true, hint: 'Um relatório sobre o que você pedir.' },
  { kind: 'new_doc', label: 'Novo documento', icon: FilePlus2, ask: true, hint: 'Cria um documento novo a partir das fontes.' },
];

const ICON: Record<StudioKind, typeof FileText> = Object.fromEntries(TOOLS.map((t) => [t.kind, t.icon])) as Record<StudioKind, typeof FileText>;

function loadResults(key: string): StudioResult[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

/** Painel "Estúdio" (como no NotebookLM): gera conteúdos a partir das fontes selecionadas. */
export function Studio({ nodeId, storageKey, compact }: { nodeId?: string; storageKey: string; compact?: boolean }) {
  const { canEdit } = useLayout();
  const scope = useScope();
  const [results, setResults] = useState<StudioResult[]>(() => loadResults(storageKey));
  const [pending, setPending] = useState<StudioKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<StudioKind | null>(null);
  const [open, setOpen] = useState<StudioResult | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(results.slice(0, 30)));
    } catch {
      /* ignore */
    }
  }, [results, storageKey]);

  async function generate(kind: StudioKind, instruction?: string, designId?: string | null) {
    setError(null);
    setPending((p) => [...p, kind]);
    try {
      const r = await api.post<Omit<StudioResult, 'id' | 'createdAt'>>('/notebook/studio', { kind, scope, nodeId: nodeId ?? null, instruction, designId: designId ?? null });
      const result: StudioResult = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString(), designId: designId ?? null };
      setResults((list) => [result, ...list]);
      setOpen(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending((p) => {
        const i = p.indexOf(kind);
        return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        {TOOLS.map((t) => {
          const busy = pending.includes(t.kind);
          return (
            <button
              key={t.kind}
              disabled={busy || (t.kind === 'new_doc' && !canEdit)}
              onClick={() => (t.ask ? setAsking(t.kind) : generate(t.kind))}
              title={t.hint}
              className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-left text-sm hover:border-accent hover:bg-accent-soft/40 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-accent" /> : <t.icon className="size-4 shrink-0 text-accent" />}
              <span className="leading-tight">{t.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setAuditOpen(true)}
          className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/60 px-3 py-2.5 text-left text-sm hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/30"
          title="Encontra documentos desatualizados, contradições entre documentos e fontes que mudaram"
        >
          <FileSearch className="size-4 shrink-0 text-amber-600" />
          <span className="truncate">Verificar o que está desatualizado</span>
        </button>
      </div>

      {error && <p className="mt-3 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {!results.length && !pending.length ? (
          <div className="px-4 pt-6 text-center text-xs text-fg-subtle">
            <Wand2 className="mx-auto mb-2 size-5" />
            Os conteúdos gerados ficam salvos aqui. Eles usam as fontes marcadas na árvore{nodeId ? ' e este documento' : ''}.
          </div>
        ) : (
          <div className="space-y-1.5">
            {pending.map((k, i) => (
              <div key={`p${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-fg-muted">
                <Loader2 className="size-4 animate-spin" /> Gerando {TOOLS.find((t) => t.kind === k)?.label.toLowerCase()}…
              </div>
            ))}
            {results.map((r) => {
              const Icon = ICON[r.kind] ?? FileText;
              return (
                <button key={r.id} onClick={() => setOpen(r)} className="group flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted">
                  <Icon className="size-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.title}</span>
                    <span className="block text-xs text-fg-subtle">
                      {r.label} · {r.sources.length} fonte(s) · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setResults((list) => list.filter((x) => x.id !== r.id));
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg hover:text-red-600 group-hover:opacity-100"
                    title="Remover"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {asking && (
        <AskDialog
          kind={asking}
          onClose={() => setAsking(null)}
          onSubmit={(instruction, designId) => {
            setAsking(null);
            void generate(asking, instruction, designId);
          }}
        />
      )}
      {open && <ResultDialog result={open} onClose={() => setOpen(null)} />}
      {auditOpen && <AuditDialog onClose={() => setAuditOpen(false)} />}
    </div>
  );
}

function AskDialog({ kind, onClose, onSubmit }: { kind: StudioKind; onClose: () => void; onSubmit: (instruction: string, designId: string | null) => void }) {
  const [text, setText] = useState('');
  const [designId, setDesignId] = useState('');
  const { data: designs = [] } = useDesigns();
  const isDoc = kind === 'new_doc';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isDoc ? 'Novo documento a partir das fontes' : 'Relatório'}
      description={isDoc ? 'A IA escreve um rascunho usando as fontes selecionadas. Você revisa antes de salvar.' : 'Descreva o relatório que você precisa.'}
      className="max-w-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) onSubmit(text.trim(), designId || null);
        }}
        className="space-y-4"
      >
        <Field label="O que gerar?">
          <Textarea
            autoFocus
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isDoc ? 'Ex.: Um procedimento passo a passo de restauração do backup, juntando o que está nos documentos de infraestrutura.' : 'Ex.: Compare as regras de férias entre os contratos e liste as diferenças.'}
          />
        </Field>
        {isDoc && (
          <Field label="Design (opcional)" hint="O padrão visual e as diretrizes de conteúdo do design também orientam a IA.">
            <Select value={designId} onChange={(e) => setDesignId(e.target.value)}>
              <option value="">— Sem design —</option>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={text.trim().length < 3}>
            <Wand2 className="size-4" /> Gerar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResultDialog({ result, onClose }: { result: StudioResult; onClose: () => void }) {
  const nav = useNavigate();
  const { canEdit } = useLayout();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const goto = (s: ChatSource) => {
    onClose();
    nav(citationHref(s));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={result.title} description={`${result.label} · gerado ${timeAgo(result.createdAt)}`} className="top-[6vh] max-w-3xl">
      <div className="max-h-[62vh] overflow-y-auto pr-1">
        <MarkdownView markdown={result.markdown} sources={result.sources} onCite={goto} />
        {!!result.sources.length && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 text-xs font-medium text-fg-subtle">Fontes usadas</div>
            <SourceList sources={result.sources} onCite={goto} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(result.markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copiado' : 'Copiar Markdown'}
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setSaving(true)}>
            <Save className="size-4" /> Salvar como página
          </Button>
        )}
      </div>
      {saving && <SaveAsPageDialog result={result} onClose={() => setSaving(false)} onSaved={onClose} />}
    </Dialog>
  );
}

/** Cria uma página com o conteúdo gerado, guardando de quais documentos (e versões) ele veio. */
function SaveAsPageDialog({ result, onClose, onSaved }: { result: StudioResult; onClose: () => void; onSaved: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: spaces = [] } = useSpaces();
  const { data: designs = [] } = useDesigns();
  const [spaceId, setSpaceId] = useState('');
  const [designId, setDesignId] = useState(result.designId ?? '');
  const [title, setTitle] = useState(result.title);
  const firstSpace = spaces.find((s) => s.slug === result.sources[0]?.spaceSlug)?.id ?? spaces[0]?.id ?? '';
  const target = spaceId || firstSpace;
  const save = useMutation({
    mutationFn: async () => {
      // Citações [n] não fazem sentido fora da conversa: viram texto simples.
      const md = result.markdown.replace(/\s?\[(\d{1,2})\](?!\()/g, '');
      const node = await api.post<{ id: string }>('/nodes', {
        spaceId: target,
        title,
        content: markdownToJSON(md),
        status: 'draft',
        designId: designId || null,
        derivedFrom: [...new Set(result.sources.map((s) => s.nodeId))],
      });
      return node;
    },
    onSuccess: (node) => {
      qc.invalidateQueries({ queryKey: qk.tree(target) });
      qc.invalidateQueries({ queryKey: qk.spaces });
      const slug = spaces.find((s) => s.id === target)?.slug;
      onClose();
      onSaved();
      if (slug) nav(`/s/${slug}/p/${node.id}`);
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Salvar como página" description="Fica como rascunho, ligada às fontes. Se uma fonte mudar, a página aparece na verificação de desatualizados.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-accent" />
        </Field>
        <Field label="Espaço">
          <Select value={target} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Design">
          <Select value={designId} onChange={(e) => setDesignId(e.target.value)}>
            <option value="">— Sem design —</option>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!target}>
            <Save className="size-4" /> Criar página
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const FINDING_LABEL: Record<AuditFinding['type'], string> = {
  contradiction: 'Contradição',
  source_changed: 'Fonte mudou',
  review_overdue: 'Revisão vencida',
  stale: 'Sem edição há muito tempo',
  marked_outdated: 'Marcado como desatualizado',
};

function AuditDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { canEdit, me } = useLayout();
  const scope = useScope();
  const [deep, setDeep] = useState(true);
  const [maxDocs, setMaxDocs] = useState(8);
  const [done, setDone] = useState<Record<string, string>>({});
  const run = useMutation({ mutationFn: () => api.post<AuditResult>('/notebook/audit', { scope, deep: deep && me.features.ai, maxDocs }) });

  const fix = useMutation({
    mutationFn: async (f: AuditFinding) => {
      const instruction = [
        f.type === 'source_changed' ? 'Atualize este documento conforme a versão atual da fonte.' : 'Corrija a informação desatualizada ou contraditória neste documento.',
        `Problema encontrado: ${f.detail}`,
        f.suggestion && `Sugestão: ${f.suggestion}`,
      ]
        .filter(Boolean)
        .join('\n');
      const p = await api.post<{ id: string }>('/ai/propose', {
        nodeId: f.nodeId,
        instruction,
        useSources: true,
        scope,
        referenceNodeIds: f.related ? [f.related.nodeId] : [],
      });
      return { f, p };
    },
    onSuccess: ({ f, p }) => {
      setDone((d) => ({ ...d, [f.id]: p.id }));
      qc.invalidateQueries({ queryKey: qk.openProposals });
      qc.invalidateQueries({ queryKey: qk.proposals(f.nodeId) });
    },
  });

  const refresh = useMutation({
    mutationFn: async (f: AuditFinding) => {
      await api.post(`/nodes/${f.nodeId}/sources/refresh`);
      return f;
    },
    onSuccess: (f) => setDone((d) => ({ ...d, [f.id]: 'ok' })),
  });

  const open = (nodeId: string, slug: string, proposal?: string) => {
    onClose();
    nav(`/s/${slug}/p/${nodeId}${proposal ? `?proposal=${proposal}` : ''}`);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="O que está desatualizado?"
      description="Analisa as fontes selecionadas na árvore. Cada problema pode virar uma proposta de correção, que alguém aprova."
      className="top-[6vh] max-w-3xl"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} disabled={!me.features.ai} />
          Comparar documentos com IA (encontra contradições; mais lento)
        </label>
        {deep && (
          <label className="flex items-center gap-2 text-fg-muted">
            até
            <input type="number" min={1} max={30} value={maxDocs} onChange={(e) => setMaxDocs(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="h-7 w-14 rounded border border-border bg-bg px-2" />
            documentos
          </label>
        )}
        <Button size="sm" className="ml-auto" loading={run.isPending} onClick={() => run.mutate()}>
          <RefreshCw className="size-4" /> {run.data ? 'Analisar de novo' : 'Analisar'}
        </Button>
      </div>

      <div className="mt-4 max-h-[58vh] overflow-y-auto pr-1">
        {run.isPending && (
          <p className="flex items-center gap-2 py-8 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" /> Analisando{deep ? ' e comparando documentos (pode levar um minuto)' : ''}…
          </p>
        )}
        {run.error && <p className="text-sm text-red-600">{(run.error as Error).message}</p>}
        {run.data && !run.isPending && (
          <>
            <p className="mb-3 text-xs text-fg-subtle">
              {run.data.scopeDocs} documento(s) na seleção{run.data.deep ? ` · ${run.data.checkedDocs} comparado(s) com IA` : ''} · {run.data.findings.length} ponto(s) de atenção
            </p>
            {!run.data.findings.length && (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="size-4" /> Nada desatualizado encontrado nas fontes selecionadas.
              </p>
            )}
            <div className="space-y-2">
              {run.data.findings.map((f) => (
                <div key={f.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', f.severity === 'high' ? 'text-red-500' : f.severity === 'medium' ? 'text-amber-500' : 'text-fg-subtle')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => open(f.nodeId, f.spaceSlug)} className="truncate text-sm font-medium hover:underline">
                          {f.title || 'Sem título'}
                        </button>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-fg-muted">{FINDING_LABEL[f.type]}</span>
                      </div>
                      <p className="mt-1 text-sm text-fg-muted">{f.detail}</p>
                      {f.suggestion && <p className="mt-1 text-xs text-fg-subtle">Sugestão: {f.suggestion}</p>}
                      {f.related && (
                        <button onClick={() => open(f.related!.nodeId, f.related!.spaceSlug)} className="mt-1 flex items-center gap-1 text-xs text-accent hover:underline">
                          <BookMarked className="size-3" /> Comparado com: {f.related.title || 'Sem título'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => open(f.nodeId, f.spaceSlug)}>
                      <ExternalLink className="size-3.5" /> Abrir
                    </Button>
                    {f.type === 'source_changed' && canEdit && (
                      <Button size="sm" variant="secondary" disabled={!!done[f.id]} loading={refresh.isPending && refresh.variables?.id === f.id} onClick={() => refresh.mutate(f)}>
                        <Check className="size-3.5" /> Já está ok
                      </Button>
                    )}
                    {canEdit && me.features.aiProposals && f.type !== 'stale' && (
                      done[f.id] && done[f.id] !== 'ok' ? (
                        <Button size="sm" variant="secondary" onClick={() => open(f.nodeId, f.spaceSlug, done[f.id])}>
                          <GitPullRequestArrow className="size-3.5" /> Revisar proposta
                        </Button>
                      ) : (
                        <Button size="sm" disabled={done[f.id] === 'ok'} loading={fix.isPending && fix.variables?.id === f.id} onClick={() => fix.mutate(f)}>
                          <Wand2 className="size-3.5" /> Gerar proposta de correção
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
            {fix.error && <p className="mt-2 text-sm text-red-600">{(fix.error as Error).message}</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}
