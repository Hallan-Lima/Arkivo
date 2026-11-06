import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import * as RDialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileUp, FolderPlus, Home, Layers, Search, Sparkles, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useSpaces } from '@/lib/hooks';
import type { SearchHit } from '@/lib/types';
import { untitled } from '@/lib/utils';
import { StatusBadge } from './ui';

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const itemCls = 'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-muted';

export function CommandPalette({ open, onOpenChange, isAdmin, onNewSpace }: { open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean; onNewSpace: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data: spaces = [] } = useSpaces();
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api.get<SearchHit[]>(`/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length > 1,
  });

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    nav(to);
  };

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg shadow-2xl">
          <RDialog.Title className="sr-only">Buscar</RDialog.Title>
          <RDialog.Description className="sr-only">Busque documentos e comandos</RDialog.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-fg-subtle" />
              <Command.Input value={q} onValueChange={setQ} placeholder="Buscar documentos ou digitar um comando…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {dq.length > 1 && (
                <Command.Group heading="Documentos" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
                  {hits.map((h) => (
                    <Command.Item key={h.id} value={`doc-${h.id}`} onSelect={() => go(`/s/${h.space_slug}/p/${h.id}`)} className={itemCls}>
                      <FileText className="mt-0.5 size-4 shrink-0 self-start text-fg-subtle" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{untitled(h.title)}</span>
                          <StatusBadge status={h.status} />
                        </div>
                        <div className="text-xs text-fg-subtle">{h.space_name}</div>
                        {h.snippet && <div className="mt-0.5 line-clamp-2 text-xs text-fg-muted" dangerouslySetInnerHTML={{ __html: sanitizeSnippet(h.snippet) }} />}
                      </div>
                    </Command.Item>
                  ))}
                  {!isFetching && !hits.length && <div className="px-3 py-6 text-center text-sm text-fg-subtle">Nada encontrado para “{dq}”.</div>}
                </Command.Group>
              )}
              {dq.length <= 1 && (
                <>
                  <Command.Group heading="Navegar" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
                    <Command.Item value="home" onSelect={() => go('/')} className={itemCls}>
                      <Home className="size-4 text-fg-subtle" /> Início
                    </Command.Item>
                    <Command.Item value="assistant" onSelect={() => go('/assistant')} className={itemCls}>
                      <Sparkles className="size-4 text-fg-subtle" /> Perguntar ao assistente de IA
                    </Command.Item>
                    <Command.Item value="import" onSelect={() => go('/import')} className={itemCls}>
                      <FileUp className="size-4 text-fg-subtle" /> Importar documentos
                    </Command.Item>
                    {spaces.map((s) => (
                      <Command.Item key={s.id} value={`space-${s.id}`} onSelect={() => go(`/s/${s.slug}`)} className={itemCls}>
                        <Layers className="size-4 text-fg-subtle" /> {s.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {isAdmin && (
                    <Command.Group heading="Administração" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle">
                      <Command.Item
                        value="new-space"
                        onSelect={() => {
                          onOpenChange(false);
                          onNewSpace();
                        }}
                        className={itemCls}
                      >
                        <FolderPlus className="size-4 text-fg-subtle" /> Novo espaço
                      </Command.Item>
                      <Command.Item value="users" onSelect={() => go('/admin/users')} className={itemCls}>
                        <Users className="size-4 text-fg-subtle" /> Gerenciar usuários
                      </Command.Item>
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** O servidor só insere <mark>; escapamos todo o resto. */
function sanitizeSnippet(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}
