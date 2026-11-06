import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TreeItem, TreeNode } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function buildTree(items: TreeItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach((i) => map.set(i.id, { ...i, children: [] }));
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    const parent = node.parent_id ? map.get(node.parent_id) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.position - b.position);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Caminho (ancestrais) de um nó, do topo até ele. */
export function ancestors(items: TreeItem[], id: string): TreeItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const path: TreeItem[] = [];
  let cur = byId.get(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(date: string | Date) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return 'agora';
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function untitled(title: string | null | undefined) {
  return title?.trim() || 'Sem título';
}
