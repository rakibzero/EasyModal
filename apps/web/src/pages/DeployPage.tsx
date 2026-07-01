import { useEffect, useState } from 'react';
import { api, type PublicAccount } from '../api/client';
import { Banner } from '../components/Banner';
import { LogStream } from '../components/LogStream';
import { useAppStore } from '../store/appStore';
import { WORKFLOW_PACKS } from '@easymodal/shared';
import type { InstanceStatus, Milestone } from '@easymodal/shared';

const CHECKLIST: { id: Milestone; label: string }[] = [
  { id: 'image-building', label: 'Building container image' },
  { id: 'models-downloading', label: 'Downloading models' },
  { id: 'comfyui-starting', label: 'Starting ComfyUI' },
  { id: 'url-ready', label: 'Deployment ready' },
];

export function DeployPage() {
  const logs = useAppStore((s) => s.logs);
  const setStep = useAppStore((s) => s.setStep);
  const setInstanceStatus = useAppStore((s) => s.setInstanceStatus);
  const cfg = useAppStore((s) => s.deployConfig);

  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [deploying, setDeploying] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAccounts().then(({ accounts }) => {
      setAccounts(accounts);
      if (accounts.length && !accountId) setAccountId(accounts[0].id);
    });
  }, [accountId]);

  // Derive reached milestones from the log stream.
  const reached = new Set<Milestone>();
  let failed = false;
  for (const l of logs) {
    if (l.milestone === 'failed') failed = true;
    else if (l.milestone) reached.add(l.milestone);
  }
  const allDone = reached.has('url-ready') && !failed;

  const selectedPacks = (cfg.packs ?? ['wan22'])
    .map((id) => WORKFLOW_PACKS.find((p) => p.id === id)?.label ?? id)
    .join(', ');

  async function deploy() {
    if (!accountId) {
      setError('Pick a Modal account first.');
      return;
    }
    setDeploying(true);
    setError(null);
    reached.clear();
    try {
      const res = await fetch('/api/instances/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Deploy rejected (${res.status}).`);
      } else {
        setInstanceId(data.instanceId);
        setInstanceStatus(data.status as InstanceStatus);
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Deploy</h2>
      <p className="mt-1 text-sm text-slate-400">
        Build ComfyUI on Modal with your chosen hardware + workflow packs.
      </p>

      {/* Account picker */}
      <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-300">Deploy to account</h3>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            No accounts yet.{' '}
            <button onClick={() => setStep('keys')} className="underline">
              Add one in Keys →
            </button>
          </p>
        ) : (
          <select
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.modalTokenId})
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Config summary */}
      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-300">Configuration</h3>
          <button onClick={() => setStep('configure')} className="text-xs text-sky-400 underline">
            edit
          </button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
          <dt>App</dt>
          <dd className="text-slate-200">{cfg.appName}</dd>
          <dt>GPU</dt>
          <dd className="text-slate-200">{cfg.gpu}</dd>
          <dt>RAM</dt>
          <dd className="text-slate-200">{cfg.memoryMb / 1024} GB</dd>
          <dt>vCPU</dt>
          <dd className="text-slate-200">{cfg.cpu}</dd>
          <dt>Max concurrent</dt>
          <dd className="text-slate-200">{cfg.maxInputs}</dd>
          <dt>Timeout</dt>
          <dd className="text-slate-200">{cfg.timeoutSeconds / 60} min</dd>
          <dt>Packs</dt>
          <dd className="text-slate-200">{selectedPacks}</dd>
        </dl>
      </section>

      {error && (
        <div className="mt-4">
          <Banner variant="error" title="Couldn't start deploy">
            {error}
          </Banner>
        </div>
      )}

      <div className="mt-5">
        <button
          onClick={deploy}
          disabled={deploying || !accountId}
          className="w-full rounded-lg bg-sky-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-50 hover:bg-sky-500"
        >
          {deploying ? 'Deploying…' : '🚀 Deploy ComfyUI to Modal'}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          First build downloads ~30GB of models (15-30 min). More packs = bigger build.
        </p>
      </div>

      {/* Live milestone checklist */}
      {(instanceId || deploying || reached.size > 0 || failed) && (
        <div className="mt-6 space-y-2">
          {CHECKLIST.map((step) => {
            const done = reached.has(step.id);
            const active = !done && !failed && (deploying || instanceId);
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
              >
                <span
                  className={`h-3 w-3 flex-none rounded-full ${
                    done ? 'bg-emerald-400' : active ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                <span className={`flex-1 ${done ? 'text-slate-200' : 'text-slate-400'}`}>{step.label}</span>
                {done && <span className="text-xs text-emerald-300">done</span>}
              </div>
            );
          })}
          {failed && (
            <div className="flex items-center gap-3 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
              <span className="h-3 w-3 flex-none rounded-full bg-red-500" />
              <span className="flex-1 text-red-200">Deploy failed — see logs below.</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-400">Live log</h3>
        <LogStream />
      </div>

      {allDone && (
        <div className="mt-5">
          <Banner variant="success" title="ComfyUI is deployed! 🎉">
            Your instance is ready.{' '}
            <button onClick={() => setStep('launch')} className="underline">
              Go to Launch →
            </button>
          </Banner>
        </div>
      )}
    </div>
  );
}
