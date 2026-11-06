import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import type { Space } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, Dialog, Field, Input, Textarea } from './ui';

const COLORS = ['#e0e7ff', '#dcfce7', '#fef3c7', '#fee2e2', '#e0f2fe', '#f3e8ff', '#fce7f3', '#e4e4e7'];
const ICONS = ['💻', '🛠️', '🗄️', '🔐', '📊', '👥', '💰', '📦', '🌐', '📚'];

export function NewSpaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);

  const create = useMutation({
    mutationFn: () => api.post<Space>('/spaces', { name, description: description || null, icon, color }),
    onSuccess: (space) => {
      qc.invalidateQueries({ queryKey: qk.spaces });
      onOpenChange(false);
      setName('');
      setDescription('');
      nav(`/s/${space.slug}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Novo espaço" description="Um espaço agrupa a documentação de uma área ou time (ex.: Infraestrutura, Banco de Dados, RH).">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Infraestrutura" />
        </Field>
        <Field label="Descrição (opcional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Ícone e cor</span>
          <div className="flex flex-wrap gap-1">
            {ICONS.map((i) => (
              <button type="button" key={i} onClick={() => setIcon(i)} className={cn('grid size-8 place-items-center rounded-md text-base hover:bg-muted', icon === i && 'bg-muted ring-1 ring-accent')}>
                {i}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 pt-1">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} className={cn('size-6 rounded-full border border-border', color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-bg')} style={{ background: c }} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </div>
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Criar espaço
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
