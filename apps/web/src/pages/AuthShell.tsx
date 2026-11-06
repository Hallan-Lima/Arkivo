import type { ReactNode } from 'react';
import { Logo } from '@/components/ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-10" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-fg-subtle">Arkivo · documentação viva, open source</p>
      </div>
    </div>
  );
}
