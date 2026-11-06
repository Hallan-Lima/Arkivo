/** Extrai o texto puro de um documento Tiptap/ProseMirror (usado na busca e no diff de versões). */
export function extractText(doc: unknown): string {
  const blocks: string[] = [];
  const BLOCK = new Set(['paragraph', 'heading', 'codeBlock', 'listItem', 'taskItem', 'tableCell', 'tableHeader', 'blockquote']);

  const walk = (node: any, out: string[]) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string') {
      out.push(node.text);
      return;
    }
    if (node.type === 'hardBreak') {
      out.push('\n');
      return;
    }
    if (Array.isArray(node.content)) {
      if (BLOCK.has(node.type) && !node.content.some((c: any) => BLOCK.has(c?.type))) {
        const parts: string[] = [];
        node.content.forEach((c: any) => walk(c, parts));
        const line = parts.join('').trim();
        if (line) out.push(line);
        return;
      }
      node.content.forEach((c: any) => walk(c, out));
    }
  };

  walk(doc, blocks);
  return blocks.join('\n').trim();
}
