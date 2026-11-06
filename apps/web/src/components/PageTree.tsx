import { useState, type DragEvent } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';
import * as DM from '@radix-ui/react-dropdown-menu';
import { ChevronRight, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { buildTree, cn, untitled } from '@/lib/utils';
import { useCreateNode, useDeleteNode, useMoveNode, useTree } from '@/lib/hooks';
import type { Space, TreeItem, TreeNode } from '@/lib/types';

type DropZone = 'before' | 'inside' | 'after';

function useExpanded(spaceId: string) {
  const key = `arkivo:tree:${spaceId}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string, force?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const open = force ?? !next.has(id);
      if (open) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { expanded, toggle };
}

export function PageTree({ space, canEdit }: { space: Space; canEdit: boolean }) {
  const { data: items = [], isLoading } = useTree(space.id);
  const { expanded, toggle } = useExpanded(space.id);
  const move = useMoveNode(space.id);
  const [drag, setDrag] = useState<{ id: string; over?: string; zone?: DropZone } | null>(null);

  const tree = buildTree(items);

  function isDescendant(ancestorId: string, nodeId: string) {
    const byId = new Map(items.map((i) => [i.id, i]));
    let cur = byId.get(nodeId);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return false;
  }

  function drop(target: TreeItem, zone: DropZone) {
    if (!drag || drag.id === target.id || isDescendant(drag.id, target.id)) return setDrag(null);
    const others = items.filter((i) => i.id !== drag.id);
    let parentId: string | null;
    let position: number;
    if (zone === 'inside') {
      parentId = target.id;
      const kids = others.filter((i) => i.parent_id === target.id);
      position = kids.length ? Math.max(...kids.map((k) => k.position)) + 1 : 1;
      toggle(target.id, true);
    } else {
      parentId = target.parent_id;
      const siblings = others.filter((i) => i.parent_id === target.parent_id).sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex((s) => s.id === target.id);
      const neighbor = zone === 'before' ? siblings[idx - 1] : siblings[idx + 1];
      position = neighbor ? (neighbor.position + target.position) / 2 : target.position + (zone === 'before' ? -1 : 1);
    }
    move.mutate({ id: drag.id, parentId, position });
    setDrag(null);
  }

  if (isLoading) return <div className="px-3 py-1 text-xs text-fg-subtle">Carregando…</div>;
  if (!tree.length) return <div className="py-1 pl-8 text-xs text-fg-subtle">Nenhuma página ainda</div>;

  return (
    <div role="tree">
      {tree.map((n) => (
        <TreeRow key={n.id} node={n} depth={0} space={space} canEdit={canEdit} expanded={expanded} toggle={toggle} drag={drag} setDrag={setDrag} onDrop={drop} />
      ))}
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  space: Space;
  canEdit: boolean;
  expanded: Set<string>;
  toggle: (id: string, force?: boolean) => void;
  drag: { id: string; over?: string; zone?: DropZone } | null;
  setDrag: (d: { id: string; over?: string; zone?: DropZone } | null) => void;
  onDrop: (target: TreeItem, zone: DropZone) => void;
}

function TreeRow({ node, depth, space, canEdit, expanded, toggle, drag, setDrag, onDrop }: RowProps) {
  const nav = useNavigate();
  const { nodeId } = useParams();
  const create = useCreateNode();
  const del = useDeleteNode(space.id);
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const zone = drag?.over === node.id ? drag.zone : undefined;

  function zoneFor(e: DragEvent<HTMLDivElement>): DropZone {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < r.height * 0.25) return 'before';
    if (y > r.height * 0.75) return 'after';
    return 'inside';
  }

  async function addChild() {
    const created = await create.mutateAsync({ spaceId: space.id, parentId: node.id });
    toggle(node.id, true);
    nav(`/s/${space.slug}/p/${created.id}`);
  }

  async function remove() {
    const msg = hasChildren
      ? `Excluir "${untitled(node.title)}" e todas as subpáginas? Essa ação não pode ser desfeita.`
      : `Excluir "${untitled(node.title)}"? Essa ação não pode ser desfeita.`;
    if (!confirm(msg)) return;
    await del.mutateAsync(node.id);
    if (nodeId === node.id) nav(`/s/${space.slug}`);
  }

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          setDrag({ id: node.id });
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => {
          if (!drag || drag.id === node.id) return;
          e.preventDefault();
          const z = zoneFor(e);
          if (drag.over !== node.id || drag.zone !== z) setDrag({ ...drag, over: node.id, zone: z });
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(node, zoneFor(e));
        }}
        className={cn(
          'group relative flex h-7 items-center rounded-md pr-1 text-sm',
          zone === 'inside' && 'bg-accent-soft ring-1 ring-accent',
          drag?.id === node.id && 'opacity-40',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {zone === 'before' && <div className="absolute inset-x-2 top-0 h-0.5 rounded bg-accent" />}
        {zone === 'after' && <div className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-accent" />}
        <button
          onClick={() => toggle(node.id)}
          className={cn('grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-border', !hasChildren && 'invisible')}
          aria-label={isOpen ? 'Recolher' : 'Expandir'}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <NavLink
          to={`/s/${space.slug}/p/${node.id}`}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-fg-muted hover:text-fg',
              isActive && 'font-medium text-fg',
            )
          }
        >
          {node.icon ? <span className="text-sm leading-none">{node.icon}</span> : <FileText className="size-3.5 shrink-0 text-fg-subtle" />}
          <span className="truncate">{untitled(node.title)}</span>
        </NavLink>
        {canEdit && (
          <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
            <DM.Root>
              <DM.Trigger className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-border hover:text-fg" aria-label="Mais ações">
                <MoreHorizontal className="size-3.5" />
              </DM.Trigger>
              <DM.Portal>
                <DM.Content align="start" className="z-50 min-w-40 rounded-lg border border-border bg-bg p-1 text-sm shadow-lg">
                  <DM.Item onSelect={remove} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-red-600 outline-none data-[highlighted]:bg-muted">
                    <Trash2 className="size-3.5" /> Excluir
                  </DM.Item>
                </DM.Content>
              </DM.Portal>
            </DM.Root>
            <button onClick={addChild} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-border hover:text-fg" aria-label="Nova subpágina" title="Nova subpágina">
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {isOpen &&
        node.children.map((c) => (
          <TreeRow key={c.id} node={c} depth={depth + 1} space={space} canEdit={canEdit} expanded={expanded} toggle={toggle} drag={drag} setDrag={setDrag} onDrop={onDrop} />
        ))}
    </div>
  );
}
