import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';

interface WorkflowFile {
  path: string;
  name: string;
  size: number;
}
interface WorkflowCategory {
  pack: string;
  label: string;
  files: WorkflowFile[];
}

export function WorkflowsPage() {
  const setStep = useAppStore((s) => s.setStep);
  const packs = useAppStore((s) => s.deployConfig.packs ?? []);
  const [categories, setCategories] = useState<WorkflowCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/workflows')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setCategories(data.categories ?? []);
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function download(pack: string, filename: string) {
    window.open(`/api/workflows/${pack}/${encodeURIComponent(filename)}`, '_blank');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-xl font-semibold text-white">Workflows</h2>
      <p className="mt-1 text-sm text-slate-400">
        These workflow files ship inside the ComfyUI container. After launch, load any of them
        from ComfyUI's workflow menu. Files from packs you didn't enable are still listed but
        may need nodes you didn't install.
      </p>

      {loading ? (
        <p className="mt-6 text-slate-400">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          {categories.map((cat) => {
            const enabled = packs.includes(cat.pack);
            return (
              <section key={cat.pack}>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{cat.label}</h3>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      enabled ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {enabled ? 'pack enabled' : 'pack off — nodes may be missing'}
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/40">
                  {cat.files.map((f) => (
                    <li key={f.path} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{f.name}</p>
                        <p className="text-xs text-slate-500">
                          {f.path} · {(f.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => download(cat.pack, f.path)}
                        className="flex-none rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setStep('configure')}
          className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          ← Configure
        </button>
        <button
          onClick={() => setStep('deploy')}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Continue → Deploy
        </button>
      </div>
    </div>
  );
}
