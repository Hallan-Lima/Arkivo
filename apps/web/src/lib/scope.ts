import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Scope, TreeItem } from './types';

/**
 * Seleção de fontes do notebook (as "caixinhas" da árvore, como no NotebookLM).
 * Guarda só as exceções: sem nenhuma marcação, todos os documentos entram.
 * Vale a marcação mais próxima subindo na árvore: documento → pais → espaço.
 */
interface State {
  spaces: Record<string, boolean>;
  /** v = entra ou não; s = espaço do documento (para limpar ao marcar o espaço inteiro). */
  nodes: Record<string, { v: boolean; s: string }>;
  /** Mostra as caixinhas na árvore. */
  picking: boolean;
}

const KEY = 'arkivo:notebook-scope';
const listeners = new Set<() => void>();

function read(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') return { spaces: s.spaces ?? {}, nodes: s.nodes ?? {}, picking: !!s.picking };
  } catch {
    /* ignore */
  }
  return { spaces: {}, nodes: {}, picking: false };
}

let state: State = read();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useScopeState() {
  return useSyncExternalStore(subscribe, () => state);
}

/** O que vai para a API. */
export function toScope(s: State = state): Scope {
  return { spaces: s.spaces, nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, o]) => [k, o.v])) };
}

export function useScope(): Scope {
  const s = useScopeState();
  return toScope(s);
}

export const docsLabel = (n: number) => (n === 1 ? '1 documento' : `${n} documentos`);

export const hasSelection = (s: State) => Object.keys(s.spaces).length > 0 || Object.keys(s.nodes).length > 0;

/** Efetivo para um documento: marcação mais próxima subindo a árvore, senão a do espaço, senão "entra". */
export function isIncluded(s: State, items: TreeItem[], id: string, spaceId: string): boolean {
  const byId = new Map(items.map((i) => [i.id, i]));
  let cur = byId.get(id);
  while (cur) {
    const o = s.nodes[cur.id];
    if (o) return o.v;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return s.spaces[spaceId] ?? true;
}

function descendants(items: TreeItem[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) =>
    items.filter((i) => i.parent_id === pid).forEach((c) => {
      out.push(c.id);
      walk(c.id);
    });
  walk(id);
  return out;
}

/** Algum descendente com valor diferente do item → caixinha "parcial". */
export function isPartial(s: State, items: TreeItem[], id: string, spaceId: string): boolean {
  const mine = isIncluded(s, items, id, spaceId);
  return descendants(items, id).some((d) => s.nodes[d] && s.nodes[d].v !== mine);
}

export function isSpaceIncluded(s: State, spaceId: string) {
  return s.spaces[spaceId] ?? true;
}

export function isSpacePartial(s: State, spaceId: string) {
  const mine = isSpaceIncluded(s, spaceId);
  return Object.values(s.nodes).some((o) => o.s === spaceId && o.v !== mine);
}

export const scopeActions = {
  togglePicking() {
    set({ ...state, picking: !state.picking });
  },
  setPicking(picking: boolean) {
    set({ ...state, picking });
  },
  toggleNode(items: TreeItem[], id: string, spaceId: string) {
    const next = !isIncluded(state, items, id, spaceId);
    const nodes = { ...state.nodes };
    for (const d of descendants(items, id)) delete nodes[d];
    delete nodes[id];
    // Só grava a exceção se for diferente do que herdaria do pai.
    const item = items.find((i) => i.id === id);
    const inherited = item?.parent_id ? isIncluded({ ...state, nodes }, items, item.parent_id, spaceId) : (state.spaces[spaceId] ?? true);
    if (inherited !== next) nodes[id] = { v: next, s: spaceId };
    set({ ...state, nodes });
  },
  toggleSpace(spaceId: string) {
    const next = !(state.spaces[spaceId] ?? true);
    const spaces = { ...state.spaces };
    if (next) delete spaces[spaceId];
    else spaces[spaceId] = false;
    const nodes = Object.fromEntries(Object.entries(state.nodes).filter(([, o]) => o.s !== spaceId));
    set({ ...state, spaces, nodes });
  },
  /** Só este documento (e subpáginas) — atalho para "conversar com este doc". */
  only(spaceIds: string[], id: string, spaceId: string) {
    set({ ...state, spaces: Object.fromEntries(spaceIds.map((s) => [s, false])), nodes: { [id]: { v: true, s: spaceId } } });
  },
  all() {
    set({ ...state, spaces: {}, nodes: {} });
  },
  none(spaceIds: string[]) {
    set({ ...state, spaces: Object.fromEntries(spaceIds.map((s) => [s, false])), nodes: {} });
  },
};

/** Quantos documentos entram na seleção atual (conta feita no servidor, já sem os "nunca usar"). */
export function useScopeSummary(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: ['notebook-scope', scope],
    queryFn: () => api.post<{ included: number; total: number; blocked: number }>('/notebook/scope', { scope }),
    enabled,
    staleTime: 15_000,
  });
}
