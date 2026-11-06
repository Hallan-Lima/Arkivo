import { extname } from 'node:path';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { marked } from 'marked';
import { extractText, getDocumentProxy } from 'unpdf';
import JSZip from 'jszip';

export interface ConversionResult {
  /** HTML que o editor converte em blocos (tags desconhecidas são descartadas pelo editor). */
  html: string;
  title?: string;
  format: string;
  supported: boolean;
  warnings: string[];
}

type SaveImage = (name: string, mime: string, data: Buffer) => Promise<string>;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CODE_EXT: Record<string, string> = {
  '.sql': 'sql', '.sh': 'bash', '.bash': 'bash', '.ps1': 'powershell', '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml', '.xml': 'xml', '.ini': 'ini', '.conf': 'ini', '.cfg': 'ini', '.env': 'bash',
  '.java': 'java', '.cs': 'csharp', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.log': 'plaintext', '.bat': 'dos', '.cmd': 'dos',
};

export const SUPPORTED_EXTENSIONS = ['.docx', '.pptx', '.pdf', '.md', '.markdown', '.html', '.htm', '.txt', '.csv', '.xlsx', ...Object.keys(CODE_EXT)];

export async function convertFile(name: string, mime: string, data: Buffer, saveImage: SaveImage): Promise<ConversionResult> {
  const ext = extname(name).toLowerCase();
  const warnings: string[] = [];

  if (ext === '.docx') {
    const result = await mammoth.convertToHtml(
      { buffer: data },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const buf = await image.readAsBuffer();
          const imgExt = (image.contentType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
          return { src: await saveImage(`imagem.${imgExt}`, image.contentType, buf) };
        }),
      },
    );
    const unique = [...new Set(result.messages.filter((m) => m.type === 'warning').map((m) => m.message))].slice(0, 5);
    warnings.push(...unique);
    return { html: result.value, title: firstHeading(result.value), format: 'Word (.docx)', supported: true, warnings };
  }

  if (ext === '.pptx') {
    const zip = await JSZip.loadAsync(data);
    const slideNo = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
    const slides = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => slideNo(a) - slideNo(b));
    const parts: string[] = [];
    for (const [i, path] of slides.entries()) {
      const xml = await zip.file(path)!.async('string');
      // Cada <a:p> é um parágrafo; o primeiro costuma ser o título do slide.
      const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
        .map((m) => [...m[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(''))
        .map((t) => t.trim())
        .filter(Boolean);
      const [title, ...rest] = paras;
      const items = rest.length ? `<ul>${rest.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
      parts.push(`<h2>Slide ${i + 1}${title ? ` — ${esc(title)}` : ''}</h2>${items}`);
    }
    if (!parts.length) warnings.push('Nenhum texto encontrado nos slides.');
    warnings.push('Somente o texto dos slides é importado; imagens e layout ficam no arquivo original anexado.');
    return { html: parts.join(''), format: 'PowerPoint (.pptx)', supported: true, warnings };
  }

  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    const html = pages.map((p) => pdfPageToHtml(p)).join('<hr>');
    if (!html.replace(/<[^>]+>/g, '').trim()) {
      warnings.push('Nenhum texto encontrado — o PDF parece ser digitalizado (imagem). O arquivo original foi anexado; o OCR chega numa próxima versão.');
    } else {
      warnings.push('PDFs não guardam a estrutura do documento: revise títulos e listas antes de publicar.');
    }
    return { html, format: 'PDF', supported: true, warnings };
  }

  const text = () => data.toString('utf8').replace(/^﻿/, '');

  if (ext === '.md' || ext === '.markdown') {
    const html = await marked.parse(text(), { gfm: true });
    return { html, title: firstHeading(html), format: 'Markdown', supported: true, warnings };
  }

  if (ext === '.html' || ext === '.htm') {
    let html = text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    html = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
    html = html.replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1>/gi, '');
    return { html, title: title || firstHeading(html), format: 'HTML', supported: true, warnings };
  }

  if (ext === '.txt') {
    return { html: plainToHtml(text()), format: 'Texto', supported: true, warnings };
  }

  if (ext === '.csv') {
    const rows = parseCsv(text());
    if (rows.length > 500) warnings.push(`Mostrando as primeiras 500 de ${rows.length} linhas.`);
    return { html: tableHtml(rows.slice(0, 501)), format: 'CSV', supported: true, warnings };
  }

  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as any);
    const parts: string[] = [];
    wb.eachSheet((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length > 500) return;
        const values = (row.values as any[]).slice(1).map((v) => cellText(v));
        rows.push(values);
      });
      if (sheet.rowCount > 501) warnings.push(`Aba "${sheet.name}": mostrando as primeiras 500 linhas.`);
      parts.push(`<h2>${esc(sheet.name)}</h2>${rows.length ? tableHtml(rows) : '<p>(aba vazia)</p>'}`);
    });
    return { html: parts.join(''), format: 'Excel (.xlsx)', supported: true, warnings };
  }

  if (CODE_EXT[ext]) {
    return { html: `<pre><code class="language-${CODE_EXT[ext]}">${esc(text())}</code></pre>`, format: `Código (${ext})`, supported: true, warnings };
  }

  if (mime.startsWith('image/')) {
    const src = await saveImage(name, mime, data);
    return { html: `<img src="${src}" alt="${esc(name)}">`, format: 'Imagem', supported: true, warnings };
  }

  // Formato não convertido: a página é criada com o original anexado, para não perder nada.
  return {
    html: `<p>Documento importado de <strong>${esc(name)}</strong>. A conversão automática de <code>${esc(ext || mime)}</code> ainda não é suportada — o arquivo original está anexado a esta página (painel Detalhes).</p>`,
    format: ext ? ext.slice(1).toUpperCase() : mime,
    supported: false,
    warnings: ['Formato ainda não convertido automaticamente: a página guarda o arquivo original como anexo.'],
  };
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function firstHeading(html: string) {
  const m = html.match(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').trim().slice(0, 200) || undefined : undefined;
}

function plainToHtml(t: string) {
  return t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Junta as linhas extraídas do PDF em parágrafos (heurística simples). */
function pdfPageToHtml(page: string) {
  const lines = page.split('\n').map((l) => l.trim());
  const paras: string[] = [];
  let cur = '';
  for (const line of lines) {
    if (!line) {
      if (cur) paras.push(cur);
      cur = '';
      continue;
    }
    const isBullet = /^([•\-–*]|\d+[.)])\s+/.test(line);
    if (cur && (isBullet || /[.:;!?]$/.test(cur) || cur.length < 50)) {
      paras.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur} ${line}` : line;
    }
  }
  if (cur) paras.push(cur);
  return paras.map((p) => `<p>${esc(p)}</p>`).join('');
}

function parseCsv(t: string): string[][] {
  const delimiter = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r: any) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
    return '';
  }
  return String(v);
}

function tableHtml(rows: string[][]) {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const cells = (r: string[], tag: string) => Array.from({ length: width }, (_, i) => `<${tag}>${esc(r[i] ?? '')}</${tag}>`).join('');
  return `<table><tbody><tr>${cells(rows[0], 'th')}</tr>${rows
    .slice(1)
    .map((r) => `<tr>${cells(r, 'td')}</tr>`)
    .join('')}</tbody></table>`;
}
