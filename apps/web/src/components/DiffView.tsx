import { useMemo } from 'react';
import { diffLines, diffWordsWithSpace } from 'diff';
import { cn } from '@/lib/utils';

type Side = { no: number; text: string } | null;
interface Row {
  type: 'same' | 'changed' | 'removed' | 'added';
  left: Side;
  right: Side;
}

function splitLines(value: string) {
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Monta linhas alinhadas lado a lado, pareando remoções e adições (como no VS Code). */
function buildRows(oldText: string, newText: string): Row[] {
  const rows: Row[] = [];
  let l = 1;
  let r = 1;
  const parts = diffLines(oldText, newText);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (const text of splitLines(part.value)) rows.push({ type: 'same', left: { no: l++, text }, right: { no: r++, text } });
      continue;
    }
    // Um bloco removido seguido de um adicionado vira "linhas modificadas" pareadas.
    const removed = part.removed ? splitLines(part.value) : [];
    let added: string[] = [];
    if (part.removed && parts[i + 1]?.added) {
      added = splitLines(parts[i + 1].value);
      i++;
    } else if (part.added) {
      added = splitLines(part.value);
    }
    const n = Math.max(removed.length, added.length);
    for (let k = 0; k < n; k++) {
      const left = k < removed.length ? { no: l++, text: removed[k] } : null;
      const right = k < added.length ? { no: r++, text: added[k] } : null;
      rows.push({ type: left && right ? 'changed' : left ? 'removed' : 'added', left, right });
    }
  }
  return rows;
}

/** Destaque das palavras que mudaram dentro de uma linha modificada. */
function InlineDiff({ a, b, side }: { a: string; b: string; side: 'left' | 'right' }) {
  const parts = diffWordsWithSpace(a, b);
  return (
    <>
      {parts.map((p, i) => {
        if (side === 'left' && p.added) return null;
        if (side === 'right' && p.removed) return null;
        const strong = (side === 'left' && p.removed) || (side === 'right' && p.added);
        return (
          <span key={i} className={cn(strong && (side === 'left' ? 'diff-word-del' : 'diff-word-add'))}>
            {p.value}
          </span>
        );
      })}
    </>
  );
}

function Cell({ side, row }: { side: 'left' | 'right'; row: Row }) {
  const cell = side === 'left' ? row.left : row.right;
  if (!cell) return <td colSpan={2} className="diff-filler" />;
  const bg = row.type === 'same' ? '' : side === 'left' ? 'diff-line-del' : 'diff-line-add';
  const other = side === 'left' ? row.right : row.left;
  return (
    <>
      <td className={cn('diff-no', bg)}>{cell.no}</td>
      <td className={cn('diff-text', bg)}>
        {row.type === 'changed' && other ? <InlineDiff a={row.left!.text} b={row.right!.text} side={side} /> : cell.text || ' '}
      </td>
    </>
  );
}

export function DiffStats({ oldText, newText }: { oldText: string; newText: string }) {
  const { add, del } = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const p of diffLines(oldText, newText)) {
      if (p.added) add += p.count ?? 0;
      if (p.removed) del += p.count ?? 0;
    }
    return { add, del };
  }, [oldText, newText]);
  return (
    <span className="font-mono text-xs">
      <span className="text-emerald-600">+{add}</span> <span className="text-red-600">−{del}</span>
    </span>
  );
}

/**
 * Comparação de textos.
 * - split: lado a lado com linhas alinhadas e preenchimento hachurado (estilo VS Code).
 * - changes: somente as linhas alteradas, agrupadas em blocos.
 */
export function DiffView({ oldText, newText, mode, oldLabel = 'Antes', newLabel = 'Depois' }: { oldText: string; newText: string; mode: 'split' | 'changes'; oldLabel?: string; newLabel?: string }) {
  const rows = useMemo(() => buildRows(oldText, newText), [oldText, newText]);
  const changed = rows.filter((r) => r.type !== 'same').length;

  if (!changed) return <div className="p-8 text-center text-sm text-fg-subtle">Nenhuma diferença de conteúdo.</div>;

  if (mode === 'split') {
    return (
      <table className="diff-table">
        <colgroup>
          <col className="w-12" />
          <col />
          <col className="w-12" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2}>{oldLabel}</th>
            <th colSpan={2} className="border-l border-border">
              {newLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="diff-row">
              <Cell side="left" row={row} />
              <Cell side="right" row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Apenas alterações: blocos de linhas alteradas consecutivas.
  const hunks: Row[][] = [];
  let cur: Row[] = [];
  rows.forEach((row) => {
    if (row.type === 'same') {
      if (cur.length) hunks.push(cur);
      cur = [];
    } else cur.push(row);
  });
  if (cur.length) hunks.push(cur);

  return (
    <div className="space-y-3 p-3">
      {hunks.map((h, i) => {
        const first = h.find((r) => r.right)?.right?.no ?? h[0].left?.no ?? 0;
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-muted px-3 py-1 font-mono text-[11px] text-fg-subtle">
              Bloco {i + 1} · linha {first}
            </div>
            <table className="diff-table">
              <colgroup>
                <col className="w-12" />
                <col className="w-6" />
                <col />
              </colgroup>
              <tbody>
                {h.flatMap((row, k) => [
                  row.left && (
                    <tr key={`${k}-l`}>
                      <td className="diff-no diff-line-del">{row.left.no}</td>
                      <td className="diff-sign diff-line-del">−</td>
                      <td className="diff-text diff-line-del">{row.right ? <InlineDiff a={row.left.text} b={row.right.text} side="left" /> : row.left.text || ' '}</td>
                    </tr>
                  ),
                  row.right && (
                    <tr key={`${k}-r`}>
                      <td className="diff-no diff-line-add">{row.right.no}</td>
                      <td className="diff-sign diff-line-add">+</td>
                      <td className="diff-text diff-line-add">{row.left ? <InlineDiff a={row.left.text} b={row.right.text} side="right" /> : row.right.text || ' '}</td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
