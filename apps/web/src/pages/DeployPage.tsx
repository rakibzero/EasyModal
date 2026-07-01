import { useState } from 'react';
import { api } from '../api/client';
import { Banner } from '../components/Banner';
import { LogStream } from '../components/LogStream';
import { useAppStore } from '../store/appStore';
import type { InstanceStatus, Milestone } from '@wan22/shared';

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

  const [deploying, setDeploying] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive reached milestones from the log stream (milestone field on events).
  const reached = new Set<Milestone>();
  let failed = false;
  for (const l of logs) {
    if (l.milestone === 'failed') failed = true;
    else if (l.milestone) reached.add(l.milestone);
  }
  const allDone = reached.has('url-ready') && !failed;

  async function deploy() {
    setDeploying(true);
    setError(null);
    reached.clear();
    try {
      // Use the first/only account (v1 single-account).
      const { accounts } = await api.listAccounts();
      if (!accounts.length) {
        setError('No account yet — add your keys in the Keys step first.');
        setDeploying(false);
        return;
      }
      const res = await fetch('/api/instances/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accounts[0].id }),
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
    <div>
      <h2 className="text-xl font-semibold text-white">Deploy</h2>
      <p className="mt-1 text-sm text-slate-400">
        Build ComfyUI on Modal and prefetch all the models.
      </p>

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
          disabled={deploying}
          className="w-full rounded-lg bg-sky-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-50 hover:bg-sky-500"
        >
          {deploying ? 'Deploying…' : '🚀 Deploy ComfyUI to Modal'}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          First build downloads ~30GB of models (15-30 min). Subsequent deploys are fast.
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
                <span className={`flex-1 ${done ? 'text-slate-200' : 'text-slate-400'}`}>
                  {step.label}
                </span>
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
