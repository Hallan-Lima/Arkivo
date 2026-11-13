import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Caixinha de "usar como fonte da IA", com estado parcial (alguns filhos marcados). */
export function SourceCheckbox({
  checked,
  partial,
  disabled,
  onChange,
  title,
}: {
  checked: boolean;
  partial?: boolean;
  disabled?: boolean;
  onChange: () => void;
  title?: string;
}) {
  const state = disabled ? 'disabled' : partial ? 'partial' : checked ? 'on' : 'off';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? 'mixed' : checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors',
        state === 'on' && 'border-accent bg-accent text-accent-fg',
        state === 'partial' && 'border-accent bg-accent/70 text-accent-fg',
        state === 'off' && 'border-fg-subtle/60 bg-bg hover:border-accent',
        state === 'disabled' && 'cursor-not-allowed border-border bg-muted text-fg-subtle',
      )}
    >
      {state === 'on' && <Check className="size-3" strokeWidth={3} />}
      {state === 'partial' && <Minus className="size-3" strokeWidth={3} />}
    </button>
  );
}
