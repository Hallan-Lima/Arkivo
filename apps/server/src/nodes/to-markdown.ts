/**
 * Converte um documento Tiptap/ProseMirror (JSON) em Markdown.
 * Usado para dar contexto à IA, no servidor MCP e para comparar propostas.
 */
type PMNode = { type: string; attrs?: Record<string, any>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: any }[] };

export function toMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  return blocks((doc as PMNode).content ?? [], '').replace(/\n{3,}/g, '\n\n').trim();
}

function blocks(nodes: PMNode[], indent: string): string {
  return nodes.map((n) => block(n, indent)).filter((s) => s !== null).join('\n\n');
}

function block(n: PMNode, indent: string): string {
  switch (n.type) {
    case 'paragraph':
      return indent + inline(n.content);
    case 'heading':
      return `${indent}${'#'.repeat(n.attrs?.level ?? 1)} ${inline(n.content)}`;
    case 'blockquote':
      return blocks(n.content ?? [], '')
        .split('\n')
        .map((l) => `${indent}> ${l}`)
        .join('\n');
    case 'codeBlock': {
      const lang = n.attrs?.language && n.attrs.language !== 'plaintext' ? n.attrs.language : '';
      const code = (n.content ?? []).map((c) => c.text ?? '').join('');
      return `${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``;
    }
    case 'horizontalRule':
      return `${indent}---`;
    case 'bulletList':
      return list(n, indent, () => '- ');
    case 'orderedList':
      return list(n, indent, (i) => `${(n.attrs?.start ?? 1) + i}. `);
    case 'taskList':
      return list(n, indent, (_i, item) => `- [${item.attrs?.checked ? 'x' : ' '}] `);
    case 'table':
      return table(n, indent);
    case 'image':
      return `${indent}![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`;
    default:
      return n.content ? blocks(n.content, indent) : inline([n]);
  }
}

function list(n: PMNode, indent: string, bullet: (i: number, item: PMNode) => string) {
  return (n.content ?? [])
    .map((item, i) => {
      const prefix = bullet(i, item);
      const [first, ...rest] = item.content ?? [];
      const head = first ? block(first, '').trimStart() : '';
      const tail = rest.map((c) => block(c, indent + ' '.repeat(prefix.length))).join('\n');
      return `${indent}${prefix}${head}${tail ? `\n${tail}` : ''}`;
    })
    .join('\n');
}

function table(n: PMNode, indent: string) {
  const rows = (n.content ?? []).map((row) => (row.content ?? []).map((cell) => blocks(cell.content ?? [], '').replace(/\n+/g, ' ').replace(/\|/g, '\\|')));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const lines = [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`)];
  return lines.map((l) => indent + l).join('\n');
}

function inline(nodes: PMNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'image') return `![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`;
      let t = n.text ?? '';
      for (const m of n.marks ?? []) {
        if (m.type === 'code') t = `\`${t}\``;
        else if (m.type === 'bold') t = `**${t}**`;
        else if (m.type === 'italic') t = `*${t}*`;
        else if (m.type === 'strike') t = `~~${t}~~`;
        else if (m.type === 'highlight') t = `==${t}==`;
        else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`;
      }
      return t;
    })
    .join('');
}
