import { useEffect, useState } from 'react';
import { Banner } from '../components/Banner';
import { StatusDot } from '../components/StatusDot';
import { useAppStore } from '../store/appStore';
import type { InstanceStatus } from '@wan22/shared';

interface InstanceInfo {
  id: string;
  name: string;
  status: InstanceStatus;
  url?: string;
  lastDeployedAt?: string;
  lastError?: string;
  config: { appName: string; gpu: string; maxInputs: number };
}

const STATUS_LABEL: Record<InstanceStatus, string> = {
  idle: 'Idle',
  building: 'Building…',
  downloading: 'Downloading models…',
  serving: 'Starting up…',
  ready: 'Live',
  failed: 'Failed',
  cold: 'Cold (waking up)',
};

export function LaunchPage() {
  const logs = useAppStore((s) => s.logs);
  const setStep = useAppStore((s) => s.setStep);
  const [instance, setInstance] = useState<InstanceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the instance list on mount + when logs change (status updates stream in).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/instances');
        const data = await res.json();
        const latest = data.instances?.[data.instances.length - 1] as InstanceInfo | undefined;
        if (!cancelled) {
          setInstance(latest ?? null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [logs.length]);

  // Derive live status from recent logs for snappier feedback than polling.
  const derivedStatus: InstanceStatus | null = (() => {
    if (!instance) return null;
    const recent = logs.slice(-30);
    for (let i = recent.length - 1; i >= 0; i--) {
      const m = recent[i].milestone;
      if (m === 'failed') return 'failed';
      if (m === 'url-ready') return 'ready';
    }
    return null;
  })();

  const status = derivedStatus ?? instance?.status ?? 'idle';

  async function refresh() {
    if (!instance) return;
    await fetch(`/api/instances/${instance.id}/refresh`, { method: 'POST' });
  }

  async function removeInstance() {
    if (!instance) return;
    if (!confirm('Remove this instance record? (The Modal app itself is not deleted.)')) return;
    await fetch(`/api/instances/${instance.id}`, { method: 'DELETE' });
    setInstance(null);
  }

  if (loading) {
    return <p className="text-slate-400">Loading…</p>;
  }

  if (!instance) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-white">Launch</h2>
        <div className="mt-6">
          <Banner variant="info" title="No instance yet">
            Deploy ComfyUI first, then come back here to open it.{' '}
            <button onClick={() => setStep('deploy')} className="underline">
              Go to Deploy →
            </button>
          </Banner>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Launch</h2>
      <p className="mt-1 text-sm text-slate-400">Open your ComfyUI and start animating.</p>

      <div className="mt-6 space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-white">{instance.config.appName}</h3>
              <StatusDot status={status} label={STATUS_LABEL[status]} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {instance.config.gpu} · max {instance.config.maxInputs} concurrent
              {instance.lastDeployedAt &&
                ` · deployed ${new Date(instance.lastDeployedAt).toLocaleString()}`}
            </p>
          </div>
        </div>

        {instance.status === 'failed' && instance.lastError && (
          <Banner variant="error" title="Last deploy failed">
            {instance.lastError.slice(0, 300)}
          </Banner>
        )}

        {/* The big button */}
        <a
          href={instance.url || '#'}
          target={instance.url ? '_blank' : undefined}
          rel="noreferrer"
          onClick={(e) => {
            if (!instance.url) e.preventDefault();
          }}
          className={`block w-full rounded-xl px-4 py-6 text-center text-lg font-bold transition ${
            instance.url
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'cursor-not-allowed bg-slate-700 text-slate-400'
          }`}
        >
          🚀 Open ComfyUI
        </a>
        {instance.url && (
          <p className="text-center text-xs text-slate-500 break-all">{instance.url}</p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={refresh}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Refresh status
          </button>
          {instance.url && (
            <button
              onClick={() => navigator.clipboard.writeText(instance.url!)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Copy link
            </button>
          )}
          <button
            onClick={() => setStep('deploy')}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Redeploy
          </button>
          <button
            onClick={removeInstance}
            className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
