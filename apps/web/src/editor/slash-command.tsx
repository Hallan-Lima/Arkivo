import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckSquare,
  Code2,
  Database,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlashItem {
  title: string;
  description: string;
  keywords: string[];
  icon: ComponentType<{ className?: string }>;
  run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: 'Texto', description: 'Parágrafo simples', keywords: ['p', 'texto', 'paragrafo'], icon: Type, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Título 1', description: 'Seção grande', keywords: ['h1', 'titulo'], icon: Heading1, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: 'Título 2', description: 'Seção média', keywords: ['h2', 'titulo', 'subtitulo'], icon: Heading2, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: 'Título 3', description: 'Seção pequena', keywords: ['h3', 'titulo'], icon: Heading3, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: 'Lista', description: 'Lista com marcadores', keywords: ['ul', 'bullet', 'lista'], icon: List, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Lista numerada', description: 'Passo a passo', keywords: ['ol', 'numero', 'passos'], icon: ListOrdered, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'Checklist', description: 'Lista de tarefas', keywords: ['todo', 'tarefa', 'check'], icon: CheckSquare, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Citação', description: 'Destaque um trecho', keywords: ['quote', 'citacao'], icon: Quote, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Código', description: 'Bloco de código', keywords: ['code', 'codigo', 'script'], icon: Code2, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'SQL', description: 'Bloco de consulta SQL', keywords: ['sql', 'query', 'consulta', 'banco'], icon: Database, run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock({ language: 'sql' }).run() },
  { title: 'Tabela', description: 'Tabela 3×3', keywords: ['table', 'tabela'], icon: Table, run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  {
    title: 'Imagem',
    description: 'Enviar uma imagem',
    keywords: ['imagem', 'image', 'foto', 'print'],
    icon: ImageIcon,
    run: (e, r) => {
      e.chain().focus().deleteRange(r).run();
      void import('./Editor').then((m) => m.pickAndInsertImage(e));
    },
  },
  { title: 'Divisor', description: 'Linha horizontal', keywords: ['hr', 'divisor', 'linha'], icon: Minus, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function filterItems(query: string) {
  const q = normalize(query);
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => normalize(i.title).includes(q) || i.keywords.some((k) => k.includes(q)));
}

// ---- Ponte entre o plugin (fora do React) e o menu (React) ----
type MenuState = { props: SuggestionProps<SlashItem>; items: SlashItem[] } | null;
type MenuHandle = { onKeyDown: (p: SuggestionKeyDownProps) => boolean };
let setMenuState: ((s: MenuState) => void) | null = null;
let menuHandle: MenuHandle | null = null;

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => setMenuState?.({ props, items: props.items }),
          onUpdate: (props) => setMenuState?.({ props, items: props.items }),
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              setMenuState?.(null);
              return true;
            }
            return menuHandle?.onKeyDown(props) ?? false;
          },
          onExit: () => setMenuState?.(null),
        }),
      }),
    ];
  },
});

/** Renderize uma vez junto do editor. */
export function SlashMenuHost() {
  const [state, setState] = useState<MenuState>(null);
  useEffect(() => {
    setMenuState = setState;
    return () => {
      setMenuState = null;
    };
  }, []);
  if (!state || !state.items.length) return null;
  const rect = state.props.clientRect?.();
  if (!rect) return null;
  return createPortal(
    <SlashMenu
      ref={(h) => {
        menuHandle = h;
      }}
      items={state.items}
      onSelect={(item) => state.props.command(item)}
      style={{ top: rect.bottom + 6, left: rect.left }}
    />,
    document.body,
  );
}

const SlashMenu = forwardRef<MenuHandle, { items: SlashItem[]; onSelect: (i: SlashItem) => void; style: React.CSSProperties }>(({ items, onSelect, style }, ref) => {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        if (items[index]) onSelect(items[index]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="fixed z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-bg p-1 shadow-xl" style={style}>
      <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">Blocos</div>
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          onMouseEnter={() => setIndex(i)}
          className={cn('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left', i === index && 'bg-muted')}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-bg">
            <item.icon className="size-4 text-fg-muted" />
          </span>
          <span>
            <span className="block text-sm font-medium">{item.title}</span>
            <span className="block text-xs text-fg-subtle">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
