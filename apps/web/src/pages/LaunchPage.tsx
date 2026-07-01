import { useEffect, useState } from 'react';
import { api, type PublicAccount } from '../api/client';
import { Banner } from '../components/Banner';
import { StatusDot } from '../components/StatusDot';
import { useAppStore } from '../store/appStore';
import type { InstanceStatus } from '@wan22/shared';

interface InstanceInfo {
  id: string;
  accountId: string;
  name: string;
  status: InstanceStatus;
  url?: string;
  lastDeployedAt?: string;
  lastError?: string;
  config: {
    appName: string;
    gpu: string;
    maxInputs: number;
    memoryMb?: number;
    cpu?: number;
    packs?: string[];
  };
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
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [instRes, accRes] = await Promise.all([fetch('/api/instances'), api.listAccounts()]);
        const data = await instRes.json();
        if (!cancelled) {
          setInstances(data.instances ?? []);
          setAccounts(accRes.accounts);
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

  function accountLabel(id: string): string {
    return accounts.find((a) => a.id === id)?.label ?? 'Unknown account';
  }

  async function refresh(inst: InstanceInfo) {
    await fetch(`/api/instances/${inst.id}/refresh`, { method: 'POST' });
  }

  async function removeInstance(inst: InstanceInfo) {
    if (!confirm(`Remove "${inst.name}"? (The Modal app itself is not deleted.)`)) return;
    await fetch(`/api/instances/${inst.id}`, { method: 'DELETE' });
    setInstances((prev) => prev.filter((i) => i.id !== inst.id));
  }

  async function resetNodes(inst: InstanceInfo) {
    if (!confirm(`Reset custom_nodes for "${inst.name}"?\nThis wipes Manager-installed nodes back to baseline. Saved workflows/outputs are kept.`)) return;
    setResetting(inst.id);
    try {
      const r = await api.resetNodes(inst.id);
      if (!r.ok) alert(r.message || 'Reset failed — see logs.');
    } catch (e) {
      alert(String((e as Error).message || e));
    } finally {
      setResetting(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  if (instances.length === 0) {
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
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Launch</h2>
      <p className="mt-1 text-sm text-slate-400">
        {instances.length} instance{instances.length !== 1 ? 's' : ''} across {new Set(instances.map((i) => i.accountId)).size} account(s).
      </p>

      <div className="mt-6 space-y-5">
        {instances.map((inst) => {
          const status = inst.status;
          return (
            <div key={inst.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white">{inst.config.appName}</h3>
                    <StatusDot status={status} label={STATUS_LABEL[status]} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {accountLabel(inst.accountId)} · {inst.config.gpu} · max {inst.config.maxInputs}
                    {inst.lastDeployedAt && ` · ${new Date(inst.lastDeployedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>

              {inst.status === 'failed' && inst.lastError && (
                <div className="mt-3">
                  <Banner variant="error" title="Last deploy failed">
                    {inst.lastError.slice(0, 300)}
                  </Banner>
                </div>
              )}

              <a
                href={inst.url || '#'}
                target={inst.url ? '_blank' : undefined}
                rel="noreferrer"
                onClick={(e) => !inst.url && e.preventDefault()}
                className={`mt-4 block w-full rounded-xl px-4 py-5 text-center text-lg font-bold transition ${
                  inst.url
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
              >
                🚀 Open ComfyUI
              </a>
              {inst.url && (
                <p className="mt-1 break-all text-center text-xs text-slate-500">{inst.url}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => refresh(inst)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Refresh
                </button>
                {inst.url && (
                  <button
                    onClick={() => navigator.clipboard.writeText(inst.url!)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    Copy link
                  </button>
                )}
                <button
                  onClick={() => resetNodes(inst)}
                  disabled={resetting === inst.id}
                  className="rounded-lg border border-amber-900 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                >
                  {resetting === inst.id ? 'Resetting…' : 'Reset custom_nodes'}
                </button>
                <button
                  onClick={() => setStep('deploy')}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Redeploy
                </button>
                <button
                  onClick={() => removeInstance(inst)}
                  className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
