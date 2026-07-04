import { useEffect, useState } from 'react';
import { Banner } from '../components/Banner';
import { useAppStore } from '../store/appStore';

/** A deployed instance (ComfyUI only — model download is ComfyUI-only for now). */
interface InstanceInfo {
  id: string;
  accountId: string;
  name: string;
  status: string;
  config: {
    appName: string;
    target?: 'comfyui' | 'ai-toolkit';
  };
}

/** Standard ComfyUI models/ subdirs. Must match the whitelist in comfyapp.py.tpl. */
const SUBDIRS = [
  'checkpoints',
  'loras',
  'diffusion_models',
  'unet',
  'vae',
  'text_encoders',
  'clip_vision',
  'embeddings',
  'controlnet',
  'upscale_models',
  'sam',
  'detection',
  'nlf',
  'configs',
  'gligen',
  'style_models',
  'hypernetworks',
  'vae_approx',
];

export function ModelsPage() {
  const logs = useAppStore((s) => s.logs);
  const setStep = useAppStore((s) => s.setStep);
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [instanceId, setInstanceId] = useState('');
  const [repo, setRepo] = useState('');
  const [filepath, setFilepath] = useState('');
  const [subdir, setSubdir] = useState('checkpoints');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/instances');
        const data = await res.json();
        if (cancelled) return;
        // Only ComfyUI instances support model download.
        const comfy = (data.instances ?? []).filter(
          (i: InstanceInfo) => (i.config.target ?? 'comfyui') === 'comfyui',
        );
        setInstances(comfy);
        if (comfy.length > 0 && !instanceId) setInstanceId(comfy[0].id);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownload() {
    setError(null);
    setDone(null);
    if (!instanceId) {
      setError('Pick a deployed ComfyUI instance first.');
      return;
    }
    if (!repo.trim() || !filepath.trim()) {
      setError('Repo and file path are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}/download-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.trim(), filepath: filepath.trim(), subdir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Download rejected (${res.status}).`);
      } else {
        setDone(`Saved to models/${subdir}/${filepath.trim().split('/').pop()}. Check the Launch log for details.`);
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-slate-400">Loading instances…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Models</h2>
      <p className="mt-1 text-sm text-slate-400">
        Download a HuggingFace model straight into your ComfyUI <code className="text-slate-300">models/</code> folder on
        the volume. It survives cold starts and shows up in ComfyUI's model loader on the next refresh.
      </p>

      {instances.length === 0 ? (
        <div className="mt-6">
          <Banner variant="warn">
            No deployed ComfyUI instances found. Deploy one first — model download runs against a live instance.
          </Banner>
          <button
            onClick={() => setStep('deploy')}
            className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Go to Deploy
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Instance
            </label>
            <select
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.status})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              The model downloads to this instance's account-scoped volume.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              HuggingFace repo
            </label>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="Comfy-Org/flux1-dev  or  https://huggingface.co/Comfy-Org/flux1-dev"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Accepts <code>user/model</code>, a full hf.co URL, or <code>user/model:filename</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              File path in repo
            </label>
            <input
              value={filepath}
              onChange={(e) => setFilepath(e.target.value)}
              placeholder="flux1-dev-fp8.safetensors  or  split_files/vae/wan2.1_vae.safetensors"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Path within the repo. Leave blank if you used the <code>user/model:filename</code> shorthand above.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Save to models/&lt;folder&gt;
            </label>
            <select
              value={subdir}
              onChange={(e) => setSubdir(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {SUBDIRS.map((s) => (
                <option key={s} value={s}>
                  {s}/
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              The model lands at <code>models/{subdir}/&lt;filename&gt;</code>. Pick the folder ComfyUI expects for this
              model type (checkpoints, loras, vae, …).
            </p>
          </div>

          {error && <Banner variant="error">{error}</Banner>}
          {done && <Banner variant="success">{done}</Banner>}

          <button
            onClick={handleDownload}
            disabled={busy}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Downloading…' : 'Download to volume'}
          </button>
        </div>
      )}

      {/* Live progress — the SSE log filtered to this instance. */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-slate-300">Live log</h3>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
          {logs.filter((l) => !instanceId || l.instanceId === instanceId).slice(-50).map((l, i) => (
            <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'success' ? 'text-emerald-400' : ''}>
              {new Date(l.timestamp).toLocaleTimeString()} [{l.level ?? 'info'}] {l.message}
            </div>
          ))}
          {logs.length === 0 && <div className="text-slate-600">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}
