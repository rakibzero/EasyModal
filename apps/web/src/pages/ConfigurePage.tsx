import {
  GPU_OPTIONS,
  RAM_OPTIONS_GB,
  CPU_OPTIONS,
  TIMEOUT_OPTIONS_MIN,
  WORKFLOW_PACKS,
  DEPLOY_TARGETS,
  type DeployTarget,
} from '@easymodal/shared';
import { useAppStore } from '../store/appStore';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-200">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const selectCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500';

export function ConfigurePage() {
  const cfg = useAppStore((s) => s.deployConfig);
  const setCfg = useAppStore((s) => s.setDeployConfig);
  const setStep = useAppStore((s) => s.setStep);

  const selectedGpu = GPU_OPTIONS.find((g) => g.value === cfg.gpu);
  const packs = cfg.packs ?? [];
  const target = cfg.target ?? 'comfyui';

  function selectTarget(id: DeployTarget) {
    const def = DEPLOY_TARGETS.find((t) => t.id === id)!;
    // Reset app name to the target's default when switching (only if the user
    // hasn't customized it away from the other target's default).
    const otherDefault = DEPLOY_TARGETS.find((t) => t.id !== id)?.defaultAppName;
    const appName = cfg.appName === otherDefault || !cfg.appName ? def.defaultAppName : cfg.appName;
    setCfg({ target: id, appName });
  }

  function togglePack(id: string) {
    const next = packs.includes(id) ? packs.filter((p) => p !== id) : [...packs, id];
    // wan22 cannot be turned off (it's the core).
    if (!next.includes('wan22')) next.unshift('wan22');
    setCfg({ packs: next });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Configure</h2>
      <p className="mt-1 text-sm text-slate-400">
        Choose what to deploy, the hardware Modal provisions, and which packs to bundle.
      </p>

      {/* Deploy target */}
      <section className="mt-6 space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-300">What do you want to deploy?</h3>
        {DEPLOY_TARGETS.map((t) => {
          const on = target === t.id;
          return (
            <label
              key={t.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                on ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-900/30'
              }`}
            >
              <input
                type="radio"
                name="deploy-target"
                className="mt-0.5 h-4 w-4 accent-sky-500"
                checked={on}
                onChange={() => selectTarget(t.id)}
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-white">{t.label}</span>
                <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>
              </div>
            </label>
          );
        })}
      </section>

      {/* Hardware */}
      <section className="mt-6 space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-300">Hardware</h3>

        <Field label="GPU" hint="The GPU Modal provisions per container.">
          <select
            className={selectCls}
            value={cfg.gpu}
            onChange={(e) => setCfg({ gpu: e.target.value })}
          >
            {GPU_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label} ({g.vramGb} GB VRAM)
                {g.heavyWorkloads ? ' — runs Wan2.2 14B' : ''}
              </option>
            ))}
          </select>
        </Field>

        {selectedGpu && !selectedGpu.heavyWorkloads && (
          <p className="rounded-lg bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            ⚠️ {selectedGpu.label} has {selectedGpu.vramGb} GB VRAM — heavy Wan2.2 14B models need ~40+ GB.
            Lighter workflows (SCAIL, Flux, upscaling) will work; full 14B I2V may OOM.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="RAM" hint="System memory per container.">
            <select
              className={selectCls}
              value={cfg.memoryMb / 1024}
              onChange={(e) => setCfg({ memoryMb: Number(e.target.value) * 1024 })}
            >
              {RAM_OPTIONS_GB.map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                </option>
              ))}
            </select>
          </Field>

          <Field label="vCPUs" hint="CPU cores per container.">
            <select
              className={selectCls}
              value={cfg.cpu}
              onChange={(e) => setCfg({ cpu: Number(e.target.value) })}
            >
              {CPU_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c} vCPU
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Max concurrent" hint="Parallel requests per container.">
            <select
              className={selectCls}
              value={cfg.maxInputs}
              onChange={(e) => setCfg({ maxInputs: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Idle timeout" hint="How long a container stays warm.">
            <select
              className={selectCls}
              value={cfg.timeoutSeconds / 60}
              onChange={(e) => setCfg({ timeoutSeconds: Number(e.target.value) * 60 })}
            >
              {TIMEOUT_OPTIONS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="App name" hint="The Modal app name (also in the deploy URL).">
          <input
            className={selectCls}
            value={cfg.appName}
            onChange={(e) => setCfg({ appName: e.target.value.replace(/[^a-z0-9-]/gi, '-').toLowerCase() })}
          />
        </Field>
      </section>

      {/* Workflow packs (ComfyUI only) */}
      {target === 'comfyui' && (
      <section className="mt-5 space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Workflow Packs</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Each pack adds its custom nodes + models to the build. More packs = bigger image + slower build.
          </p>
        </div>
        {WORKFLOW_PACKS.map((pack) => {
          const on = packs.includes(pack.id);
          const locked = pack.id === 'wan22';
          return (
            <label
              key={pack.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                on ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-900/30'
              } ${locked ? 'opacity-80' : ''}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-sky-500"
                checked={on}
                disabled={locked}
                onChange={() => togglePack(pack.id)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{pack.label}</span>
                  {locked && (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">core</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{pack.description}</p>
              </div>
            </label>
          );
        })}
      </section>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setStep('workflows')}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Continue → Workflows
        </button>
      </div>
    </div>
  );
}
