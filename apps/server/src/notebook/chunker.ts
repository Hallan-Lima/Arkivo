/**
 * Quebra o Markdown de um documento em trechos (chunks) para a busca do notebook.
 * - Respeita seções: cada trecho guarda o "caminho" de títulos (ex.: "Backup › Restauração").
 * - Junta parágrafos até ~TARGET caracteres, com sobreposição curta entre trechos vizinhos
 *   para não cortar uma ideia no meio.
 */
const TARGET = 1200;
const MAX = 1800;
const OVERLAP = 200;

export interface Chunk {
  idx: number;
  heading: string | null;
  content: string;
}

export function chunkMarkdown(markdown: string): Chunk[] {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const sections: { path: string[]; body: string[] }[] = [];
  const path: string[] = [];
  let current = { path: [] as string[], body: [] as string[] };
  let inCode = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const h = !inCode && line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (current.body.join('').trim()) sections.push(current);
      const level = h[1].length;
      path.length = Math.min(path.length, level - 1);
      path[level - 1] = h[2].trim();
      current = { path: path.filter(Boolean), body: [] };
      continue;
    }
    current.body.push(line);
  }
  if (current.body.join('').trim()) sections.push(current);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const heading = section.path.length ? section.path.join(' › ') : null;
    for (const piece of splitText(section.body.join('\n').trim())) {
      chunks.push({ idx: chunks.length, heading, content: piece });
    }
  }
  return chunks;
}

/** Junta parágrafos em blocos de ~TARGET caracteres; parágrafos enormes são cortados por frase. */
function splitText(text: string): string[] {
  if (!text) return [];
  if (text.length <= MAX) return [text];
  const paragraphs = text.split(/\n{2,}/).flatMap((p) => (p.length > MAX ? splitLong(p) : [p]));
  const out: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf && buf.length + p.length + 2 > TARGET) {
      out.push(buf.trim());
      const tail = buf.slice(-OVERLAP);
      const cut = tail.search(/[.!?\n]\s/);
      buf = (cut >= 0 ? tail.slice(cut + 1) : '').trimStart();
    }
    buf += (buf ? '\n\n' : '') + p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function splitLong(p: string): string[] {
  const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length > TARGET) {
      out.push(buf.trim());
      buf = '';
    }
    if (s.length > MAX) {
      for (let i = 0; i < s.length; i += TARGET) out.push(s.slice(i, i + TARGET));
      continue;
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
