import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { SettingsCard } from './AdminLayout';

interface General {
  workspaceName: string;
  publicUrl: string;
  defaultReviewDays: number;
}

export function GeneralSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'general'], queryFn: () => api.get<General>('/admin/settings/general') });
  const [form, setForm] = useState<General | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/admin/settings/general', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: ['admin', 'general'] });
    },
  });

  if (!form) return <Spinner />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-6"
    >
      <SettingsCard title="Empresa">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa">
            <Input required value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} />
          </Field>
          <Field label="Endereço público do Arkivo" hint="Usado nos links enviados por e-mail (convites, redefinição de senha).">
            <Input required type="url" value={form.publicUrl} onChange={(e) => setForm({ ...form, publicUrl: e.target.value })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Governança" description="Ajuda a manter a documentação atualizada.">
        <Field label="Prazo padrão de revisão (dias)" hint="Novas páginas recebem automaticamente esta data de revisão. Use 0 para não definir.">
          <Input type="number" min={0} max={3650} className="w-40" value={form.defaultReviewDays} onChange={(e) => setForm({ ...form, defaultReviewDays: Number(e.target.value) })} />
        </Field>
      </SettingsCard>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={save.isPending}>
          Salvar alterações
        </Button>
        {save.isSuccess && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" /> Salvo
          </span>
        )}
        {save.error && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
      </div>
    </form>
  );
}
