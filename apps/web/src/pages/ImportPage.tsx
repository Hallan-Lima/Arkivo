import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, FileText, FileUp, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, uploadFile, useCreateNode, useSpaces, useTree } from '@/lib/hooks';
import { htmlToJSON } from '@/lib/markdown';
import { STATUS_LABEL, type NodeStatus } from '@/lib/types';
import { buildTree, cn, untitled } from '@/lib/utils';
import type { TreeNode } from '@/lib/types';
import { Editor } from '@/editor/Editor';
import { Button, Field, Input, Select } from '@/components/ui';
import { useLayout } from '@/components/AppLayout';

interface Converted {
  fileId: string;
  fileName: string;
  size: number;
  html: string;
  title: string;
  format: string;
  supported: boolean;
  warnings: string[];
}

interface Item {
  key: string;
  file: File;
  state: 'converting' | 'ready' | 'error' | 'importing' | 'done';
  result?: Converted;
  title: string;
  error?: string;
  nodeId?: string;
  preview?: boolean;
}

export function ImportPage() {
  const { canEdit } = useLayout();
  const [params] = useSearchParams();
  const { data: spaces = [] } = useSpaces();
  const [spaceId, setSpaceId] = useState('');
  const [parentId, setParentId] = useState('');
  const [status, setStatus] = useState<NodeStatus>('draft');
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: formats } = useQuery({ queryKey: ['import-formats'], queryFn: () => api.get<{ extensions: string[] }>('/import/formats') });
  const { data: tree = [] } = useTree(spaceId || undefined);
  const create = useCreateNode();

  useEffect(() => {
    if (!spaceId && spaces.length) {
      const fromUrl = spaces.find((s) => s.slug === params.get('space'));
      setSpaceId((fromUrl ?? spaces[0]).id);
    }
  }, [spaces, spaceId, params]);

  const parentOptions = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (nodes: TreeNode[], depth: number) =>
      nodes.forEach((n) => {
        out.push({ id: n.id, label: `${'— '.repeat(depth)}${untitled(n.title)}` });
        walk(n.children, depth + 1);
      });
    walk(buildTree(tree), 0);
    return out;
  }, [tree]);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, state: 'converting' as const, title: file.name }));
    setItems((prev) => [...prev, ...list]);
    // Converte em sequência para não sobrecarregar o servidor.
    for (const item of list) {
      try {
        const result = await uploadFile<Converted>('/import/convert', item.file);
        update(item.key, { state: 'ready', result, title: result.title });
      } catch (e) {
        update(item.key, { state: 'error', error: (e as Error).message });
      }
    }
  }

  async function importAll() {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    for (const item of items.filter((i) => i.state === 'ready')) {
      update(item.key, { state: 'importing' });
      try {
        const node = await create.mutateAsync({
          spaceId,
          parentId: parentId || null,
          title: item.title,
          content: withoutTitleHeading(htmlToJSON(item.result!.html), item.title),
          status,
          sourceFileId: item.result!.fileId,
        });
        update(item.key, { state: 'done', nodeId: node.id });
      } catch (e) {
        update(item.key, { state: 'error', error: (e as Error).message });
      }
    }
  }

  const ready = items.filter((i) => i.state === 'ready').length;
  const busy = items.some((i) => i.state === 'converting' || i.state === 'importing');
  const space = spaces.find((s) => s.id === spaceId);

  if (!canEdit) return <div className="p-10 text-sm text-fg-muted">Somente editores podem importar documentos.</div>;

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Importar documentos</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Traga a documentação antiga: o conteúdo é convertido em páginas editáveis e o arquivo original fica anexado a cada página.
      </p>

      <div className="mt-8 grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-3">
        <Field label="Espaço de destino">
          <Select value={spaceId} onChange={(e) => (setSpaceId(e.target.value), setParentId(''))}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dentro da página (opcional)">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Raiz do espaço —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status das páginas">
          <Select value={status} onChange={(e) => setStatus(e.target.value as NodeStatus)}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'mt-6 cursor-pointer rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-accent hover:bg-accent-soft/40',
          dragOver && 'border-accent bg-accent-soft/60',
        )}
      >
        <UploadCloud className="mx-auto size-9 text-fg-subtle" />
        <p className="mt-3 font-medium">Arraste arquivos aqui ou clique para escolher</p>
        <p className="mt-1 text-xs text-fg-subtle">
          Word (.docx), PDF, Markdown, HTML, TXT, Excel (.xlsx), CSV, scripts (.sql, .sh, .ps1…) e imagens · até 50 MB cada. Outros formatos são guardados como anexo.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={formats ? [...formats.extensions, 'image/*', '*/*'].join(',') : undefined}
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-6 space-y-2">
          {items.map((item) => (
            <div key={item.key} className="rounded-xl border border-border">
              <div className="flex items-center gap-3 px-4 py-3">
                <StateIcon state={item.state} supported={item.result?.supported} />
                <div className="min-w-0 flex-1">
                  {item.state === 'ready' ? (
                    <Input value={item.title} onChange={(e) => update(item.key, { title: e.target.value })} className="h-8 font-medium" />
                  ) : (
                    <div className="truncate text-sm font-medium">
                      {item.state === 'done' && item.nodeId && space ? (
                        <Link to={`/s/${space.slug}/p/${item.nodeId}`} className="hover:text-accent hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs text-fg-subtle">
                    {item.file.name} · {formatBytes(item.file.size)}
                    {item.result && ` · ${item.result.format}`}
                    {item.state === 'converting' && ' · convertendo…'}
                    {item.state === 'importing' && ' · criando página…'}
                    {item.state === 'done' && ' · importado'}
                  </div>
                </div>
                {item.state === 'ready' && (
                  <button onClick={() => update(item.key, { preview: !item.preview })} className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-fg-muted hover:bg-muted hover:text-fg">
                    <Eye className="size-4" /> Prévia <ChevronDown className={cn('size-3.5 transition-transform', item.preview && 'rotate-180')} />
                  </button>
                )}
                {(item.state === 'ready' || item.state === 'error') && (
                  <button onClick={() => setItems((l) => l.filter((i) => i.key !== item.key))} className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-red-600" title="Remover">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              {item.error && <p className="border-t border-border px-4 py-2 text-xs text-red-600">{item.error}</p>}
              {!!item.result?.warnings.length && item.state !== 'done' && (
                <ul className="space-y-0.5 border-t border-border bg-amber-50/60 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {item.result.warnings.map((w, i) => (
                    <li key={i} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              {item.preview && item.result && (
                <div className="max-h-[420px] overflow-y-auto border-t border-border px-6 py-5">
                  <Editor content={htmlToJSON(item.result.html) as Record<string, unknown>} editable={false} />
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-3">
            <span className="text-sm text-fg-muted">
              {ready > 0 ? `${ready} documento(s) pronto(s) para importar em ${space?.name ?? ''}` : busy ? 'Processando…' : 'Nada pendente.'}
            </span>
            <Button onClick={importAll} disabled={!ready || busy || !spaceId}>
              <FileUp className="size-4" /> Importar {ready > 0 ? ready : ''} documento(s)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Remove o primeiro título do conteúdo quando ele repete o título da página. */
function withoutTitleHeading(doc: ReturnType<typeof htmlToJSON>, title: string) {
  const first = doc.content?.[0];
  const text = (first?.content ?? []).map((c) => c.text ?? '').join('').trim();
  if (first?.type === 'heading' && text.toLowerCase() === title.trim().toLowerCase()) {
    const rest = doc.content!.slice(1);
    return { ...doc, content: rest.length ? rest : [{ type: 'paragraph' }] };
  }
  return doc;
}

function StateIcon({ state, supported }: { state: Item['state']; supported?: boolean }) {
  if (state === 'converting' || state === 'importing') return <Loader2 className="size-5 shrink-0 animate-spin text-fg-subtle" />;
  if (state === 'error') return <XCircle className="size-5 shrink-0 text-red-500" />;
  if (state === 'done') return <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />;
  return <FileText className={cn('size-5 shrink-0', supported === false ? 'text-amber-500' : 'text-accent')} />;
}
