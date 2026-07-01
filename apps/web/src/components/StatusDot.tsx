import type { InstanceStatus } from '@wan22/shared';

interface StatusDotProps {
  status?: InstanceStatus | null;
  connected?: boolean;
  label?: string;
}

const COLORS: Record<string, string> = {
  ready: 'bg-emerald-400',
  live: 'bg-emerald-400',
  serving: 'bg-emerald-400',
  building: 'bg-amber-400 animate-pulse',
  downloading: 'bg-amber-400 animate-pulse',
  cold: 'bg-amber-400',
  idle: 'bg-slate-500',
  failed: 'bg-red-500',
};

export function StatusDot({ status, connected, label }: StatusDotProps) {
  const key = connected === false ? 'failed' : (status ?? 'idle');
  const color = COLORS[key] ?? 'bg-slate-500';
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label && <span className="text-slate-300">{label}</span>}
    </span>
  );
}
