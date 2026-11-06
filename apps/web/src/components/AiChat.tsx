import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowUp, Bot, Check, Copy, FileText, GitPullRequestArrow, MessageSquare, SquarePen, Square, Wand2 } from 'lucide-react';
import type { ChatSource } from '@/lib/types';
import { markdownToSafeHtml } from '@/lib/markdown';
import { cn, untitled } from '@/lib/utils';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  error?: boolean;
  /** Mensagem gerada no modo "Editar documento". */
  proposal?: { id: string; summary: string };
  mode?: 'ask' | 'edit';
}

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return markdownToSafeHtml(markdown);
    } catch {
      return '';
    }
  }, [markdown]);
  if (!html) return <div className={cn('whitespace-pre-wrap text-sm', className)}>{markdown}</div>;
  return <div className={cn('md-view prose prose-sm prose-zinc max-w-none dark:prose-invert', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

interface Props {
  nodeId?: string;
  suggestions: string[];
  compact?: boolean;
  storageKey?: string;
  /** Habilita o modo "Editar documento" (gera proposta com diff). */
  onPropose?: (instruction: string) => Promise<{ id: string; summary: string }>;
  onOpenProposal?: (id: string) => void;
  editSuggestions?: string[];
}

function load(key?: string): Msg[] {
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

export function AiChat({ nodeId, suggestions, compact, storageKey, onPropose, onOpenProposal, editSuggestions = [] }: Props) {
  const [messages, setMessages] = useState<Msg[]>(() => load(storageKey));
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'ask' | 'edit'>('ask');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    if (storageKey && !busy) {
      try {
        if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [messages, busy, storageKey]);

  // Textarea cresce com o conteúdo, como no ChatGPT.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  async function ask(content: string) {
    const history: Msg[] = [...messages, { role: 'user', content, mode: 'ask' }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: nodeId ?? null,
          messages: history.filter((m) => !m.error && !m.proposal && m.mode !== 'edit').map(({ role, content }) => ({ role, content })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.message === 'string' ? data.message : `Erro ${res.status}`);
      }
      let sources: ChatSource[] = [];
      try {
        sources = JSON.parse(decodeURIComponent(res.headers.get('X-Arkivo-Sources') ?? '[]'));
      } catch {
        /* ignore */
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: acc, sources }]);
      }
      if (!acc.trim()) setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: 'O provedor de IA não retornou resposta.', error: true }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: (e as Error).message, error: true }]);
    }
  }

  async function edit(content: string) {
    setMessages((m) => [...m, { role: 'user', content, mode: 'edit' }, { role: 'assistant', content: '' }]);
    try {
      const proposal = await onPropose!(content);
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: proposal.summary, proposal }]);
      onOpenProposal?.(proposal.id);
    } catch (e) {
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: (e as Error).message, error: true }]);
    }
  }

  async function send(text: string, forceMode?: 'ask' | 'edit') {
    const content = text.trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    try {
      if ((forceMode ?? mode) === 'edit' && onPropose) await edit(content);
      else await ask(content);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const editing = mode === 'edit' && !!onPropose;
  const emptySuggestions = editing ? editSuggestions : suggestions;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho da conversa */}
      <div className="flex h-9 shrink-0 items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
          <MessageSquare className="size-3.5" /> {nodeId ? 'Conversa sobre este documento' : 'Conversa'}
        </span>
        <button
          onClick={() => !busy && setMessages([])}
          disabled={!messages.length || busy}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-40"
          title="Nova conversa"
        >
          <SquarePen className="size-3.5" /> Nova
        </button>
      </div>

      <div ref={scroller} className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto py-3', !compact && 'px-1')}>
        {!messages.length && (
          <div className={cn('text-center', compact ? 'pt-6' : 'pt-16')}>
            <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
              {editing ? <Wand2 className="size-5" /> : <Bot className="size-5" />}
            </div>
            <p className="mx-auto mt-3 max-w-xs text-sm font-medium">{editing ? 'O que você quer mudar neste documento?' : nodeId ? 'Como posso ajudar com este documento?' : 'Pergunte sobre a documentação'}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-fg-subtle">
              {editing ? 'A IA cria uma proposta com as diferenças. Nada muda sem a sua aprovação.' : 'As respostas usam a documentação da empresa e citam as fontes.'}
            </p>
            <div className={cn('mt-5 flex flex-wrap justify-center gap-2', compact && 'flex-col items-stretch')}>
              {emptySuggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-border bg-bg px-3 py-2 text-left text-xs text-fg-muted hover:border-accent hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex flex-col items-end gap-1">
              {m.mode === 'edit' && (
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
                  <Wand2 className="size-3" /> Pedido de alteração
                </span>
              )}
              <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm">{m.content}</div>
            </div>
          ) : (
            <AssistantMessage key={i} msg={m} onOpenProposal={onOpenProposal} />
          ),
        )}
      </div>

      {/* Caixa de mensagem */}
      <form onSubmit={submit} className="shrink-0 rounded-2xl border border-border bg-bg shadow-sm focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          ref={textarea}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={editing ? 'Descreva a alteração…' : 'Pergunte qualquer coisa…'}
          className="block max-h-[200px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          {onPropose && (
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              <ModeBtn active={!editing} onClick={() => setMode('ask')} icon={<Bot className="size-3.5" />} label="Perguntar" />
              <ModeBtn active={editing} onClick={() => setMode('edit')} icon={<Wand2 className="size-3.5" />} label={compact ? 'Editar' : 'Editar documento'} />
            </div>
          )}
          <span className="ml-auto" />
          {!compact && <span className="whitespace-nowrap text-[10px] text-fg-subtle">Enter envia · Shift+Enter quebra linha</span>}
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} disabled={editing} className="ml-2 grid size-8 place-items-center rounded-full bg-fg text-bg disabled:opacity-50" title="Parar">
              <Square className="size-3" fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="ml-2 grid size-8 place-items-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-30" title="Enviar">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
      <p className="mt-1.5 shrink-0 text-center text-[10px] text-fg-subtle">A IA pode errar. Confira informações importantes na documentação.</p>
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-fg-muted', active && 'bg-bg font-medium text-fg shadow-sm')}>
      {icon}
      {label}
    </button>
  );
}

function AssistantMessage({ msg, onOpenProposal }: { msg: Msg; onOpenProposal?: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex gap-2.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {msg.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{msg.content}</p>
        ) : msg.proposal ? (
          <button onClick={() => onOpenProposal?.(msg.proposal!.id)} className="w-full rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-left hover:border-accent">
            <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <GitPullRequestArrow className="size-3.5" /> Proposta criada
            </span>
            <span className="mt-0.5 block text-sm">{msg.proposal.summary}</span>
            <span className="mt-1 block text-xs font-medium text-accent">Revisar alterações →</span>
          </button>
        ) : msg.content ? (
          <MarkdownView markdown={msg.content} />
        ) : (
          <span className="inline-flex gap-1 pt-2">
            <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle" />
            <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:120ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:240ms]" />
          </span>
        )}
        {!!msg.sources?.length && msg.content && !msg.error && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s) => (
              <Link
                key={s.id}
                to={`/s/${s.space_slug}/p/${s.id}`}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5 text-xs text-fg-muted hover:border-accent hover:text-fg"
                title={s.space_name}
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{untitled(s.title)}</span>
              </Link>
            ))}
          </div>
        )}
        {msg.content && !msg.error && !msg.proposal && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(msg.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copiado' : 'Copiar'}
          </button>
        )}
      </div>
    </div>
  );
}
