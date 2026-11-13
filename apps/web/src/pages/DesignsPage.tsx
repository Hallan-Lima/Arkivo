import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as RDialog from '@radix-ui/react-dialog';
import { ImagePlus, Palette, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { qk, uploadFile, useDesigns } from '@/lib/hooks';
import { FONT_STACKS, LAYOUTS, PALETTE_PRESETS, designStyle, fileUrl } from '@/lib/design';
import type { Design, DesignFont, DesignLayout, DesignPalette } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { useLayout } from '@/components/AppLayout';

type Draft = Omit<Design, 'id' | 'created_at' | 'updated_at' | 'usage'> & { id?: string };

const EMPTY: Draft = {
  name: '',
  description: '',
  palette: PALETTE_PRESETS[0].palette,
  font_heading: 'sans',
  font_body: 'sans',
  layout: 'standard',
  header_text: '',
  footer_text: '',
  logo_file_id: null,
  cover_file_id: null,
  guidelines: '',
};

const PALETTE_FIELDS: { key: keyof DesignPalette; label: string }[] = [
  { key: 'primary', label: 'Principal' },
  { key: 'accent', label: 'Destaque' },
  { key: 'heading', label: 'Títulos' },
  { key: 'text', label: 'Texto' },
  { key: 'muted', label: 'Secundário' },
  { key: 'background', label: 'Fundo' },
];

export function DesignsPage() {
  const { canEdit } = useLayout();
  const { data: designs = [], isLoading } = useDesigns();
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Designs de documentos</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Modelos visuais (paleta, fontes, layout, logo e capa) que dão a cara da empresa aos documentos e à impressão em PDF. As diretrizes de conteúdo também orientam a IA quando
            ela cria um documento com o design.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="size-4" /> Novo design
          </Button>
        )}
      </div>

      {isLoading ? (
        <Spinner className="mt-10" />
      ) : !designs.length ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
          <Palette className="mx-auto size-8 text-fg-subtle" />
          <p className="mt-3 text-sm font-medium">Nenhum design ainda</p>
          <p className="mt-1 text-sm text-fg-muted">Crie o primeiro: por exemplo "Procedimento de TI", "Política de RH" ou "Relatório executivo".</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <button
              key={d.id}
              onClick={() =>
                canEdit &&
                setEditing({
                  ...d,
                  description: d.description ?? '',
                  header_text: d.header_text ?? '',
                  footer_text: d.footer_text ?? '',
                  guidelines: d.guidelines ?? '',
                })
              }
              className={cn('overflow-hidden rounded-xl border border-border text-left', canEdit && 'hover:border-accent')}
            >
              <div className="bg-muted p-4">
                <DesignPreview draft={d} small />
              </div>
              <div className="p-3">
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-fg-subtle">
                  {LAYOUTS[d.layout]?.label} · {d.usage ?? 0} documento(s)
                </div>
                {d.description && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{d.description}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <DesignEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DesignEditor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const payload = () => ({
    name: d.name,
    description: d.description || null,
    palette: d.palette,
    fontHeading: d.font_heading,
    fontBody: d.font_body,
    layout: d.layout,
    headerText: d.header_text || null,
    footerText: d.footer_text || null,
    logoFileId: d.logo_file_id,
    coverFileId: d.cover_file_id,
    guidelines: d.guidelines || null,
  });
  const save = useMutation({
    mutationFn: () => (d.id ? api.patch(`/designs/${d.id}`, payload()) : api.post('/designs', payload())),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.designs });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/designs/${d.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.designs });
      onClose();
    },
  });

  return (
    <RDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed inset-4 z-50 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
            <RDialog.Title className="font-semibold">{d.id ? 'Editar design' : 'Novo design'}</RDialog.Title>
            <RDialog.Description className="sr-only">Paleta, fontes, layout e imagens do modelo de documento</RDialog.Description>
            <RDialog.Close className="ml-auto rounded p-1 text-fg-subtle hover:bg-muted hover:text-fg">
              <X className="size-4" />
            </RDialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <form
              id="design-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
              className="space-y-5 overflow-y-auto border-r border-border p-5"
            >
              <Field label="Nome">
                <Input required value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Procedimento de TI" />
              </Field>
              <Field label="Descrição (opcional)">
                <Input value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Quando usar este design" />
              </Field>

              <div>
                <div className="mb-1.5 text-sm font-medium">Paleta</div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {PALETTE_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      onClick={() => set({ palette: p.palette })}
                      className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs hover:border-accent"
                      title={`Usar a paleta ${p.name}`}
                    >
                      <span className="flex">
                        {[p.palette.primary, p.palette.accent, p.palette.heading].map((c) => (
                          <span key={c} className="-ml-1 size-3 rounded-full border border-white first:ml-0" style={{ background: c }} />
                        ))}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PALETTE_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                      <input type="color" value={d.palette[f.key]} onChange={(e) => set({ palette: { ...d.palette, [f.key]: e.target.value } })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fonte dos títulos">
                  <Select value={d.font_heading} onChange={(e) => set({ font_heading: e.target.value as DesignFont })}>
                    {Object.entries(FONT_STACKS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fonte do texto">
                  <Select value={d.font_body} onChange={(e) => set({ font_body: e.target.value as DesignFont })}>
                    {Object.entries(FONT_STACKS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <div className="mb-1.5 text-sm font-medium">Layout</div>
                <div className="grid gap-1.5">
                  {Object.entries(LAYOUTS).map(([k, v]) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => set({ layout: k as DesignLayout })}
                      className={cn('rounded-lg border border-border px-3 py-2 text-left hover:bg-muted', d.layout === k && 'border-accent ring-1 ring-accent')}
                    >
                      <div className="text-sm font-medium">{v.label}</div>
                      <div className="text-xs text-fg-subtle">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ImagePicker label="Logo" fileId={d.logo_file_id} onChange={(id) => set({ logo_file_id: id })} />
                <ImagePicker label="Imagem de capa" fileId={d.cover_file_id} onChange={(id) => set({ cover_file_id: id })} />
              </div>

              <Field label="Texto do cabeçalho (opcional)">
                <Input value={d.header_text ?? ''} onChange={(e) => set({ header_text: e.target.value })} placeholder="Ex.: Departamento de TI · Uso interno" />
              </Field>
              <Field label="Rodapé (opcional)">
                <Input value={d.footer_text ?? ''} onChange={(e) => set({ footer_text: e.target.value })} placeholder="Ex.: Documento controlado. Cópias impressas não são controladas." />
              </Field>
              <Field label="Diretrizes de conteúdo para a IA (opcional)" hint="Usadas pelo Estúdio ao criar um documento com este design.">
                <Textarea
                  rows={5}
                  value={d.guidelines ?? ''}
                  onChange={(e) => set({ guidelines: e.target.value })}
                  placeholder={'Ex.: Seções obrigatórias: Objetivo, Escopo, Pré-requisitos, Passo a passo, Rollback, Contatos.\nUse tabelas para responsáveis. Linguagem formal, verbos no imperativo.'}
                />
              </Field>
            </form>
            <div className="hidden min-h-0 overflow-y-auto bg-muted p-6 lg:block">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">Pré-visualização</div>
              <DesignPreview draft={d} />
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
            {d.id && (
              <Button
                variant="ghost"
                className="text-red-600"
                loading={remove.isPending}
                onClick={() => confirm(`Excluir o design "${d.name}"? Os documentos que usam ele voltam ao visual padrão.`) && remove.mutate()}
              >
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
            {(save.error || remove.error) && <span className="text-sm text-red-600">{((save.error || remove.error) as Error).message}</span>}
            <span className="ml-auto" />
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="design-form" loading={save.isPending}>
              Salvar design
            </Button>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function ImagePicker({ label, fileId, onChange }: { label: string; fileId: string | null; onChange: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = fileUrl(fileId);
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <label className="relative grid h-20 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-surface text-xs text-fg-subtle hover:border-accent">
        {url ? <img src={url} alt="" className="size-full object-contain p-1" /> : busy ? <Spinner /> : (
          <span className="flex flex-col items-center gap-1">
            <ImagePlus className="size-4" /> Enviar imagem
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setError(null);
            try {
              const r = await uploadFile<{ id: string }>('/files', f);
              onChange(r.id);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {url && (
        <button type="button" onClick={() => onChange(null)} className="mt-1 text-xs text-fg-subtle hover:text-red-600">
          Remover
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Mini documento com o design aplicado (mesmas regras CSS do documento real). */
export function DesignPreview({ draft, small }: { draft: Pick<Design, 'palette' | 'font_heading' | 'font_body' | 'layout' | 'header_text' | 'footer_text' | 'logo_file_id' | 'cover_file_id'> & { name?: string }; small?: boolean }) {
  const logo = fileUrl(draft.logo_file_id);
  const cover = fileUrl(draft.cover_file_id);
  const report = draft.layout === 'report';
  return (
    <div className={cn('doc-design pointer-events-none select-none', `layout-${draft.layout}`)} style={designStyle(draft)}>
      <div className={cn('doc-design-paper overflow-hidden', small && 'origin-top-left')} style={small ? { fontSize: '0.55rem' } : undefined}>
        {report ? (
          <div className="relative text-white" style={{ background: 'var(--d-primary)' }}>
            {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-35" />}
            <div className={cn('relative flex flex-col justify-between', small ? 'min-h-16 gap-2 p-3' : 'min-h-36 gap-5 p-6')}>
              <div className="flex items-center justify-between text-[0.7em] uppercase tracking-wider opacity-90">
                {logo ? <img src={logo} alt="" className={small ? 'h-3' : 'h-6'} /> : <span />}
                <span>{draft.header_text}</span>
              </div>
              <div className={cn('font-bold', small ? 'text-[1.4em]' : 'text-2xl')} style={{ fontFamily: 'var(--d-font-heading)' }}>
                {draft.name || 'Título do documento'}
              </div>
            </div>
            <div className="h-1" style={{ background: 'var(--d-accent)' }} />
          </div>
        ) : (
          <>
            {cover && <img src={cover} alt="" className={cn('w-full object-cover', small ? 'h-10' : 'h-28')} />}
            <div className={cn('flex items-center justify-between border-b-4', small ? 'px-3 py-2' : 'px-6 py-3')} style={{ borderColor: 'var(--d-primary)' }}>
              {logo ? <img src={logo} alt="" className={small ? 'h-3' : 'h-7'} /> : <span />}
              <span className="text-[0.7em] uppercase tracking-wider" style={{ color: 'var(--d-muted)' }}>
                {draft.header_text}
              </span>
            </div>
          </>
        )}
        <div className={cn('ProseMirror', small ? 'space-y-1 p-3' : 'space-y-3 p-6')}>
          {!report && (
            <h1 className={cn('font-bold', small ? 'text-[1.5em]' : 'text-3xl')} style={{ margin: 0 }}>
              {draft.name || 'Título do documento'}
            </h1>
          )}
          <h2 className={cn('font-semibold', small ? 'text-[1.15em]' : 'text-xl')} style={{ margin: 0 }}>
            Objetivo
          </h2>
          <p style={{ margin: 0 }}>
            Este é um exemplo de parágrafo com o texto do documento, um <a>link</a> e <code>código</code>.
          </p>
          {!small && (
            <>
              <h3 className="font-semibold">Passo a passo</h3>
              <ul className="list-disc pl-5">
                <li>Primeiro item da lista</li>
                <li>Segundo item da lista</li>
              </ul>
              <blockquote className="border-l-4 pl-3 italic">Observação importante destacada.</blockquote>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 text-left">Responsável</th>
                    <th className="border px-2 py-1 text-left">Área</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border px-2 py-1">Maria</td>
                    <td className="border px-2 py-1">Infraestrutura</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
        {draft.footer_text && (
          <div className={cn('border-t text-[0.75em]', small ? 'px-3 py-1.5' : 'px-6 py-3')} style={{ borderColor: 'color-mix(in srgb, var(--d-primary) 25%, transparent)', color: 'var(--d-muted)' }}>
            {draft.footer_text}
          </div>
        )}
      </div>
    </div>
  );
}
