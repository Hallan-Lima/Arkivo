import { Editor, generateHTML, generateJSON, type JSONContent } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { buildExtensions } from '@/editor/Editor';

let headless: Editor | null = null;
function engine() {
  if (!headless) {
    headless = new Editor({ extensions: [...buildExtensions(false), Markdown], content: '' });
  }
  return headless;
}

export function markdownToJSON(md: string): JSONContent {
  const json = engine().markdown!.parse(md || '');
  return json?.type === 'doc' ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** JSON do editor → Markdown (usado nas comparações de versões). */
export function jsonToMarkdown(json: unknown): string {
  try {
    return engine().markdown!.serialize(json as JSONContent).trim();
  } catch {
    return '';
  }
}

export function htmlToJSON(html: string): JSONContent {
  return generateJSON(html || '<p></p>', buildExtensions(false));
}

/**
 * Markdown → HTML seguro: passa pelo schema do editor (só nós/atributos conhecidos)
 * e remove links com protocolos perigosos.
 */
export function markdownToSafeHtml(md: string): string {
  const html = generateHTML(markdownToJSON(md), buildExtensions(false));
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:|\/)/i.test(href)) a.removeAttribute('href');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (!/^(https?:|\/api\/files\/)/i.test(src)) img.remove();
  });
  return doc.body.firstElementChild?.innerHTML ?? '';
}
