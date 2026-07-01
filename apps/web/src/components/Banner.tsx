import type { ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warn' | 'error';

const STYLES: Record<Variant, string> = {
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  error: 'border-red-500/40 bg-red-500/10 text-red-200',
};

export function Banner({
  variant = 'info',
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${STYLES[variant]}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
