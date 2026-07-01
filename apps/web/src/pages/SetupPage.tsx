import { useEffect, useState } from 'react';
import { api, type Prereqs } from '../api/client';
import { Banner } from '../components/Banner';

export function SetupPage() {
  const [prereqs, setPrereqs] = useState<Prereqs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .prereqs()
      .then(setPrereqs)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold text-white">Setup</h2>
      <p className="mt-1 text-sm text-slate-400">
        Let's make sure your computer is ready to deploy ComfyUI on Modal.
      </p>

      <div className="mt-6 space-y-3">
        <CheckRow
          label="Node.js"
          ok={!!prereqs}
          detail={prereqs ? `v${prereqs.nodeVersion}` : error ? 'Server unreachable' : 'Checking…'}
        />
        <CheckRow
          label="Modal CLI"
          ok={prereqs?.modalInstalled ?? null}
          detail={
            !prereqs
              ? 'Checking…'
              : prereqs.modalInstalled
                ? `v${prereqs.modalVersion} (${prereqs.modalPath})`
                : 'Not installed'
          }
        />
      </div>

      {prereqs && !prereqs.modalInstalled && (
        <div className="mt-5">
          <Banner variant="warn" title="Modal CLI is not installed">
            <p className="mb-2">Install it from your terminal, then refresh this page:</p>
            <code className="block rounded bg-slate-950/80 px-3 py-2 text-xs">pip install modal</code>
            <p className="mt-2">
              Then authenticate: <code>modal setup</code>
            </p>
          </Banner>
        </div>
      )}

      {prereqs?.allOk && (
        <div className="mt-5">
          <Banner variant="success" title="You're ready!">
            Head to the <strong>Keys</strong> step to add your tokens.
          </Banner>
        </div>
      )}
    </div>
  );
}

function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
}) {
  const color =
    ok === null ? 'bg-slate-500 animate-pulse' : ok ? 'bg-emerald-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
      <span className={`h-3 w-3 flex-none rounded-full ${color}`} />
      <span className="flex-1 font-medium text-slate-200">{label}</span>
      <span className="text-xs text-slate-400">{detail}</span>
    </div>
  );
}
