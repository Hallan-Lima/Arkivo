import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardCheck, FileUp, Home, ListChecks, LogOut, Moon, Palette, Plus, Search, Settings, Sparkles, Sun, UserCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useCreateNode, useOpenProposals, useSpaces } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { ROLE_LABEL, type Me, type Space } from '@/lib/types';
import { Kbd, Logo } from './ui';
import { PageTree } from './PageTree';
import { CommandPalette } from './CommandPalette';
import { NewSpaceDialog } from './NewSpaceDialog';
import { SourceCheckbox } from './SourceCheckbox';
import { docsLabel, hasSelection, isSpaceIncluded, isSpacePartial, scopeActions, useScopeState, useScopeSummary } from '@/lib/scope';

export interface LayoutContext {
  me: Me;
  canEdit: boolean;
  openNewSpace: () => void;
}
export const useLayout = () => useOutletContext<LayoutContext>();

export function AppLayout({ me }: { me: Me }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const canEdit = me.role !== 'viewer';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="print-scroll flex h-full">
      <Sidebar me={me} canEdit={canEdit} onSearch={() => setPaletteOpen(true)} onNewSpace={() => setNewSpaceOpen(true)} />
      <main className="print-scroll min-w-0 flex-1 overflow-y-auto">
        <Outlet context={{ me, canEdit, openNewSpace: () => setNewSpaceOpen(true) } satisfies LayoutContext} />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} isAdmin={me.role === 'admin'} onNewSpace={() => setNewSpaceOpen(true)} />
      <NewSpaceDialog open={newSpaceOpen} onOpenChange={setNewSpaceOpen} />
    </div>
  );
}

function NavItem({ to, icon: Icon, label, badge, end }: { to: string; icon: typeof Home; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn('flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-muted hover:bg-muted hover:text-fg', isActive && 'bg-muted font-medium text-fg')}
    >
      <Icon className="size-4" /> {label}
      {!!badge && <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-fg">{badge}</span>}
    </NavLink>
  );
}

function Sidebar({ me, canEdit, onSearch, onNewSpace }: { me: Me; canEdit: boolean; onSearch: () => void; onNewSpace: () => void }) {
  const { data: spaces = [] } = useSpaces();
  const { data: proposals = [] } = useOpenProposals();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const qc = useQueryClient();
  const scope = useScopeState();

  async function logout() {
    await api.post('/auth/logout');
    qc.clear();
    nav('/login', { replace: true });
  }

  return (
    <aside className="no-print flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2.5 px-3">
        <Logo className="size-6" />
        <span className="truncate text-sm font-semibold">{me.workspaceName}</span>
        <button onClick={toggle} className="ml-auto grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg" title="Alternar tema">
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>

      <div className="space-y-0.5 px-2">
        <button onClick={onSearch} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-muted hover:bg-muted hover:text-fg">
          <Search className="size-4" />
          Buscar
          <span className="ml-auto">
            <Kbd>Ctrl K</Kbd>
          </span>
        </button>
        <NavItem to="/" end icon={Home} label="Início" />
        {me.features.ai && <NavItem to="/assistant" icon={Sparkles} label="Notebook IA" />}
        <NavItem to="/reviews" icon={ClipboardCheck} label="Revisões" badge={proposals.length} />
        {canEdit && <NavItem to="/import" icon={FileUp} label="Importar" />}
        <NavItem to="/designs" icon={Palette} label="Designs" />
      </div>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Espaços</span>
        <span className="ml-auto" />
        {me.features.ai && (
          <button
            onClick={() => scopeActions.togglePicking()}
            className={cn('mr-1 grid size-5 place-items-center rounded text-fg-subtle hover:bg-muted hover:text-fg', scope.picking && 'bg-accent-soft text-accent')}
            title="Escolher as fontes da IA"
          >
            <ListChecks className="size-3.5" />
          </button>
        )}
        {me.role === 'admin' && (
          <button onClick={onNewSpace} className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-muted hover:text-fg" title="Novo espaço">
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {me.features.ai && scope.picking && <SourcesBar spaceIds={spaces.map((s) => s.id)} />}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {spaces.map((s) => (
          <SpaceSection key={s.id} space={s} canEdit={canEdit} />
        ))}
        {!spaces.length && <p className="px-2 py-2 text-xs text-fg-subtle">Nenhum espaço criado.</p>}
      </nav>

      <div className="border-t border-border p-2">
        {me.role === 'admin' && (
          <div className="mb-1">
            <NavItem to="/admin" icon={Settings} label="Administração" />
          </div>
        )}
        <DM.Root>
          <DM.Trigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-muted">
            <div className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {me.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{me.name}</div>
              <div className="truncate text-xs text-fg-subtle">{ROLE_LABEL[me.role]}</div>
            </div>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content side="top" align="start" className="z-50 w-56 rounded-lg border border-border bg-bg p-1 text-sm shadow-lg">
              <div className="px-2 py-1.5 text-xs text-fg-subtle">{me.email}</div>
              <DM.Item onSelect={() => nav('/account')} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
                <UserCircle className="size-4" /> Minha conta e senha
              </DM.Item>
              {me.role === 'admin' && (
                <DM.Item onSelect={() => nav('/admin')} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
                  <Settings className="size-4" /> Administração
                </DM.Item>
              )}
              <DM.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted">
                <LogOut className="size-4" /> Sair
              </DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      </div>
    </aside>
  );
}

/** Barra mostrada enquanto se escolhe as fontes na árvore (como o painel "Fontes" do NotebookLM). */
function SourcesBar({ spaceIds }: { spaceIds: string[] }) {
  const scope = useScopeState();
  const { data } = useScopeSummary();
  return (
    <div className="mx-2 mb-1 rounded-lg border border-accent/30 bg-accent-soft/60 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-accent">
        <Sparkles className="size-3.5" /> Fontes da IA
        <button onClick={() => scopeActions.setPicking(false)} className="ml-auto grid size-5 place-items-center rounded text-fg-subtle hover:bg-bg hover:text-fg" title="Fechar">
          <X className="size-3" />
        </button>
      </div>
      <div className="mt-0.5 text-fg-muted">
        {data ? (
          <>
            {hasSelection(scope) ? `${data.included} de ${docsLabel(data.total - data.blocked)}` : `Todas as fontes (${docsLabel(data.total - data.blocked)})`}
            {data.blocked > 0 && <span className="text-fg-subtle"> · {data.blocked} bloqueado(s)</span>}
          </>
        ) : (
          'Carregando…'
        )}
      </div>
      <div className="mt-1.5 flex gap-1">
        <button onClick={() => scopeActions.all()} className="rounded-md bg-bg px-2 py-0.5 text-fg-muted hover:text-fg">Todas</button>
        <button onClick={() => scopeActions.none(spaceIds)} className="rounded-md bg-bg px-2 py-0.5 text-fg-muted hover:text-fg">Nenhuma</button>
      </div>
    </div>
  );
}

function SpaceSection({ space, canEdit }: { space: Space; canEdit: boolean }) {
  const scope = useScopeState();
  const { slug } = useParams();
  const nav = useNavigate();
  const create = useCreateNode();
  const key = `arkivo:space-open:${space.id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0';
    } catch {
      return true;
    }
  });
  const active = slug === space.slug;

  useEffect(() => {
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open, key]);

  async function newPage() {
    const node = await create.mutateAsync({ spaceId: space.id });
    setOpen(true);
    nav(`/s/${space.slug}/p/${node.id}`);
  }

  return (
    <div className="mb-1">
      <div className={cn('group flex h-8 items-center rounded-md pr-1', active && 'bg-muted/60')}>
        {scope.picking && (
          <span className="ml-1 grid size-5 shrink-0 place-items-center">
            <SourceCheckbox
              checked={isSpaceIncluded(scope, space.id)}
              partial={isSpacePartial(scope, space.id)}
              onChange={() => scopeActions.toggleSpace(space.id)}
              title="Usar este espaço como fonte da IA"
            />
          </span>
        )}
        <button onClick={() => setOpen(!open)} className="grid size-6 shrink-0 place-items-center text-fg-subtle" aria-label={open ? 'Recolher espaço' : 'Expandir espaço'}>
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <NavLink to={`/s/${space.slug}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          <span className="grid size-5 shrink-0 place-items-center rounded text-xs" style={{ background: space.color ?? 'var(--accent-soft)' }}>
            {space.icon ?? space.name.slice(0, 1)}
          </span>
          <span className="truncate">{space.name}</span>
        </NavLink>
        {canEdit && (
          <button onClick={newPage} className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 hover:bg-border hover:text-fg group-hover:opacity-100" title="Nova página">
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="ml-2">
          <PageTree space={space} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}
