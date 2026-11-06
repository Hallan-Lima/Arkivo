import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Check, Copy, KeyRound, Link2, Mail, MoreHorizontal, Pencil, Power, Search, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { qk, useUsers } from '@/lib/hooks';
import { ROLE_LABEL, type UserRole, type UserRow } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { useLayout } from '@/components/AppLayout';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';

type Modal =
  | { kind: 'create' }
  | { kind: 'edit'; user: UserRow }
  | { kind: 'password'; user: UserRow }
  | { kind: 'link'; title: string; link: string; emailed: boolean }
  | null;

export function UsersAdmin() {
  const { me } = useLayout();
  const qc = useQueryClient();
  const { data: users = [] } = useUsers();
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: qk.users });

  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<UserRow> }) => api.patch(`/users/${v.id}`, v.patch),
    onSettled: refresh,
    onError: (e) => setError((e as Error).message),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/users/${id}`), onSettled: refresh });
  const resetLink = useMutation({
    mutationFn: (v: { user: UserRow; sendEmail: boolean }) => api.post<{ link: string; emailed: boolean }>(`/users/${v.user.id}/reset-link`, { sendEmail: v.sendEmail }),
    onSuccess: (r, v) => setModal({ kind: 'link', title: `Link de senha — ${v.user.name}`, link: r.link, emailed: r.emailed }),
    onError: (e) => setError((e as Error).message),
  });

  const filtered = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const activeCount = users.filter((u) => u.active).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-fg-subtle" />
          <Input className="pl-8" placeholder="Buscar usuário…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-fg-subtle">
          {activeCount} ativo(s) · {users.length} no total
        </span>
        <Button className="ml-auto" onClick={() => setModal({ kind: 'create' })}>
          <UserPlus className="size-4" /> Adicionar usuário
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-600" onClick={() => setError('')}>
          {error}
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5 font-medium">Usuário</th>
              <th className="px-4 py-2.5 font-medium">Papel</th>
              <th className="px-4 py-2.5 font-medium">Situação</th>
              <th className="px-4 py-2.5 font-medium">Último acesso</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((u) => (
              <tr key={u.id} className={cn(!u.active && 'opacity-60')}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{u.name.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {u.name} {u.id === me.id && <span className="text-xs font-normal text-fg-subtle">(você)</span>}
                      </div>
                      <div className="truncate text-xs text-fg-subtle">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Select className="h-8 w-36" disabled={u.id === me.id} value={u.role} onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value as UserRole } })}>
                    {Object.entries(ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex items-center gap-1.5 text-xs', u.active ? 'text-emerald-600' : 'text-fg-subtle')}>
                    <span className={cn('size-1.5 rounded-full', u.active ? 'bg-emerald-500' : 'bg-fg-subtle')} />
                    {u.active ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-muted">{u.last_login_at ? timeAgo(u.last_login_at) : 'Nunca'}</td>
                <td className="px-2">
                  <DM.Root>
                    <DM.Trigger className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-muted hover:text-fg" aria-label="Ações">
                      <MoreHorizontal className="size-4" />
                    </DM.Trigger>
                    <DM.Portal>
                      <DM.Content align="end" className="z-50 w-60 rounded-lg border border-border bg-bg p-1 text-sm shadow-lg">
                        <MenuItem icon={Pencil} onSelect={() => setModal({ kind: 'edit', user: u })}>
                          Editar dados
                        </MenuItem>
                        {me.features.email && (
                          <MenuItem icon={Mail} onSelect={() => resetLink.mutate({ user: u, sendEmail: true })}>
                            Enviar e-mail de redefinição
                          </MenuItem>
                        )}
                        <MenuItem icon={Link2} onSelect={() => resetLink.mutate({ user: u, sendEmail: false })}>
                          Gerar link para definir senha
                        </MenuItem>
                        <MenuItem icon={KeyRound} onSelect={() => setModal({ kind: 'password', user: u })}>
                          Definir senha manualmente
                        </MenuItem>
                        {u.id !== me.id && (
                          <>
                            <DM.Separator className="my-1 h-px bg-border" />
                            <MenuItem icon={Power} onSelect={() => update.mutate({ id: u.id, patch: { active: !u.active } })}>
                              {u.active ? 'Desativar acesso' : 'Reativar acesso'}
                            </MenuItem>
                            <MenuItem icon={Trash2} danger onSelect={() => confirm(`Excluir ${u.name} permanentemente? Prefira "Desativar" para manter o histórico de autoria.`) && remove.mutate(u.id)}>
                              Excluir
                            </MenuItem>
                          </>
                        )}
                      </DM.Content>
                    </DM.Portal>
                  </DM.Root>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-fg-subtle">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        <strong>Administradores</strong> gerenciam tudo · <strong>Editores</strong> criam, editam e importam documentos · <strong>Leitores</strong> apenas consultam.
      </p>

      {modal?.kind === 'create' && (
        <CreateUserDialog
          emailEnabled={me.features.email}
          onClose={() => setModal(null)}
          onCreated={(r) => {
            refresh();
            setModal(r.inviteLink ? { kind: 'link', title: `Convite — ${r.user.name}`, link: r.inviteLink, emailed: r.emailed } : null);
          }}
        />
      )}
      {modal?.kind === 'edit' && <EditUserDialog user={modal.user} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.kind === 'password' && <SetPasswordDialog user={modal.user} onClose={() => setModal(null)} />}
      {modal?.kind === 'link' && <LinkDialog {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onSelect, danger }: { icon: typeof Pencil; children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DM.Item onSelect={onSelect} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted', danger && 'text-red-600')}>
      <Icon className="size-4" /> {children}
    </DM.Item>
  );
}

function CreateUserDialog({
  emailEnabled,
  onClose,
  onCreated,
}: {
  emailEnabled: boolean;
  onClose: () => void;
  onCreated: (r: { user: UserRow; inviteLink: string | null; emailed: boolean }) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' as UserRole, password: '' });
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const create = useMutation({
    mutationFn: () =>
      api.post<{ user: UserRow; inviteLink: string | null; emailed: boolean }>('/users', {
        name: form.name,
        email: form.email,
        role: form.role,
        ...(mode === 'password' ? { password: form.password } : {}),
      }),
    onSuccess: onCreated,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Adicionar usuário">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="E-mail">
          <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Papel">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2">
          <span className="text-sm font-medium">Acesso</span>
          <div className="grid grid-cols-2 gap-2">
            <ModeCard active={mode === 'invite'} onClick={() => setMode('invite')} title={emailEnabled ? 'Enviar convite' : 'Gerar link de convite'} desc="O usuário define a própria senha." />
            <ModeCard active={mode === 'password'} onClick={() => setMode('password')} title="Definir senha agora" desc="Você informa uma senha inicial." />
          </div>
        </div>
        {mode === 'password' && (
          <Field label="Senha inicial" hint="Mínimo de 8 caracteres">
            <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        )}
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Adicionar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ModeCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-lg border border-border p-3 text-left hover:bg-muted', active && 'border-accent ring-1 ring-accent')}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-fg-subtle">{desc}</div>
    </button>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const save = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}`, { name, email }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Editar usuário">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nome">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const save = useMutation({ mutationFn: () => api.post(`/users/${user.id}/password`, { password }), onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Definir senha — ${user.name}`} description="Repasse a nova senha ao usuário por um canal seguro. Prefira o link de redefinição quando possível.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Nova senha" hint="Mínimo de 8 caracteres">
          <Input required autoFocus type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Definir senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function LinkDialog({ title, link, emailed, onClose }: { title: string; link: string; emailed: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={emailed ? 'Enviamos o link por e-mail. Se preferir, copie e envie por outro canal.' : 'O envio de e-mails não está configurado: copie o link e envie ao usuário por um canal seguro.'}
    >
      <div className="flex gap-2">
        <Input readOnly value={link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">O link é de uso único e expira automaticamente.</p>
    </Dialog>
  );
}
