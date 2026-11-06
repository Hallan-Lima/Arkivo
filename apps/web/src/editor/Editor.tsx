import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import type { EditorView } from '@tiptap/pm/view';
import { uploadFile } from '@/lib/hooks';
import { common, createLowlight } from 'lowlight';
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlashCommand, SlashMenuHost } from './slash-command';

const lowlight = createLowlight(common);

export function buildExtensions(editable: boolean) {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: !editable, autolink: true },
    }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Título' : 'Digite "/" para inserir blocos…'),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Highlight,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    Image.configure({ inline: false, allowBase64: false }),
    ...(editable ? [SlashCommand] : []),
  ];
}

interface Props {
  content: Record<string, unknown>;
  editable: boolean;
  onChange?: (json: Record<string, unknown>) => void;
  /** Muda quando o conteúdo deve ser recarregado de fora (ex.: restaurar versão). */
  contentKey?: string | number;
}

export function Editor({ content, editable, onChange, contentKey }: Props) {
  /**
   * Último conteúdo conhecido. Ao abrir, o editor normaliza o documento (ex.: parágrafo final),
   * o que dispara onUpdate sem edição do usuário — sem esta trava, só abrir a página criava versões.
   */
  const baseline = useRef<string | null>(null);
  const editor = useEditor(
    {
      extensions: buildExtensions(editable),
      content,
      editable,
      editorProps: {
        attributes: { class: 'prose prose-zinc dark:prose-invert max-w-none focus:outline-none' },
        handlePaste: (view, event) => handleImageFiles(view, event.clipboardData?.files),
        handleDrop: (view, event) => handleImageFiles(view, (event as DragEvent).dataTransfer?.files, event as DragEvent),
      },
      onCreate: ({ editor }) => {
        baseline.current = null;
        setTimeout(() => {
          baseline.current = JSON.stringify(editor.getJSON());
        }, 0);
      },
      onUpdate: ({ editor }) => {
        if (baseline.current === null) return; // normalização inicial, não é edição
        const json = editor.getJSON();
        const serialized = JSON.stringify(json);
        if (serialized === baseline.current) return;
        baseline.current = serialized;
        onChange?.(json);
      },
    },
    [contentKey, editable],
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className="arkivo-editor">
      {editable && <FormatMenu editor={editor} />}
      <EditorContent editor={editor} />
      {editable && <SlashMenuHost />}
    </div>
  );
}

/** Faz upload de imagens coladas/arrastadas e insere no documento. */
function handleImageFiles(view: EditorView, files: FileList | null | undefined, drop?: DragEvent) {
  const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
  if (!images.length || !view.editable) return false;
  const pos = drop ? view.posAtCoords({ left: drop.clientX, top: drop.clientY })?.pos : undefined;
  images.forEach(async (file) => {
    try {
      const { url } = await uploadFile<{ url: string }>('/files', file);
      const node = view.state.schema.nodes.image.create({ src: url, alt: file.name });
      const tr = pos !== undefined ? view.state.tr.insert(pos, node) : view.state.tr.replaceSelectionWith(node);
      view.dispatch(tr);
    } catch (e) {
      alert(`Falha ao enviar imagem: ${(e as Error).message}`);
    }
  });
  return true;
}

export async function pickAndInsertImage(editor: TiptapEditor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadFile<{ url: string }>('/files', file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (e) {
      alert(`Falha ao enviar imagem: ${(e as Error).message}`);
    }
  };
  input.click();
}

function FormatMenu({ editor }: { editor: TiptapEditor }) {
  const btn = (active: boolean) =>
    cn('grid size-7 place-items-center rounded text-fg-muted hover:bg-muted hover:text-fg', active && 'bg-muted text-accent');

  function setLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Endereço do link', prev ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor, from, to }) => from !== to && !editor.isActive('codeBlock')}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-bg p-1 shadow-lg"
    >
      <button className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito">
        <Bold className="size-4" />
      </button>
      <button className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico">
        <Italic className="size-4" />
      </button>
      <button className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Sublinhado">
        <Underline className="size-4" />
      </button>
      <button className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
        <Strikethrough className="size-4" />
      </button>
      <button className={btn(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} title="Código">
        <Code className="size-4" />
      </button>
      <button className={btn(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Destacar">
        <Highlighter className="size-4" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-border" />
      <button className={btn(editor.isActive('link'))} onClick={setLink} title="Link">
        <Link2 className="size-4" />
      </button>
    </BubbleMenu>
  );
}
