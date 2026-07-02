# EasyModal

> **Modal is powerful but miserable to set up. This is the missing UI.**

Deploy **ComfyUI** (image/video generation) or **[AI Toolkit](https://github.com/ostris/ai-toolkit)**
(LoRA fine-tuning) on [Modal](https://modal.com) by pasting your API keys and clicking one button.
No terminal, no Python, no fighting the CLI. Pick your target, GPU, RAM, and CPU; choose which
workflow packs to bundle; deploy to any of several Modal accounts — all from a local web UI.

This is an open-source project: anyone should be able to run serious cloud GPU tooling without
the suffering that Modal's server setup normally demands.

## Status

✅ **Functional.** Real ComfyUI deploys verified end-to-end — ComfyUI loads live on Modal with
all bundled custom nodes, the Manager, and workflow templates. AI Toolkit target ships validated
(template renders + ast.parse clean) but is not yet end-to-end deployed.

## Two deploy targets

| Target | What it is | Port | Volume |
|--------|-----------|------|--------|
| **ComfyUI** | Node-based image/video generation UI — Wan2.2, SCAIL-2, image editing, upscaling. | 8188 | `wan-models` |
| **AI Toolkit** | ostris/ai-toolkit — fine-tune LoRAs for Flux/Wan/LTX video models via web UI. | 8675 | `ai-toolkit-data` |

Pick which one in the **Configure** step. Both share the same hardware selectors
(GPU/RAM/vCPU/concurrency/timeout/app-name). Compute stays on **your** Modal account.

## What it does

1. Run one command (`npm start`).
2. Paste your **Modal token** + **HuggingFace token** (add as many Modal accounts as you like).
3. **Configure** — pick the deploy target (ComfyUI or AI Toolkit), GPU (A100-80GB, H100, L40S, …),
   RAM, vCPUs, concurrency, timeout. For ComfyUI, also pick **workflow packs** (Wan2.2 Animation,
   Image Editing, Upscaling).
4. Click **Deploy** — the app renders the right template, runs `modal deploy`, and streams live
   progress (image build → model download → server startup → URL ready).
5. Click **Open** 🚀 — you're generating (ComfyUI) or training (AI Toolkit).

Installed ComfyUI custom nodes, uploaded inputs, generated outputs, and saved workflows
**persist across container restarts** via a Modal Volume. AI Toolkit persists its output,
datasets, and training-job DB the same way.

## Quickstart

```bash
git clone <repo>
cd easymodal
npm install
npm start
```

Your browser opens automatically. Click through **Setup → Keys → Configure → Workflows → Deploy → Launch**:
paste your Modal + HuggingFace tokens, choose your target + hardware (+ packs for ComfyUI),
click **Deploy**, then **Open** 🚀.

> Requires Node 18+ and the `modal` CLI installed (`pip install modal && modal setup`).

## Key features

| Feature | What it means |
|---------|---------------|
| **Two deploy targets** | Deploy **ComfyUI** (generation) or **AI Toolkit** (LoRA training) — pick in Configure. Both fully hardware-configurable. |
| **Hardware config** | Pick GPU (7 options w/ VRAM guardrails), RAM (8–256 GB), vCPU (2–32), max concurrency (1–4), idle timeout (15–240 min), app name. Applies to both targets. |
| **Workflow packs** (ComfyUI) | Toggle bundles of custom nodes + models: **Wan2.2 Animation** (core, always on), **Image Editing** (Flux/Qwen/Ernie), **Upscaling** (SUPIR/SeedVR). |
| **Bundled configs** | ComfyUI: 28 workflow JSONs in the image. AI Toolkit: LTX-2.3 LoRA training config bundled. |
| **Multiple accounts** | Add unlimited Modal accounts, deploy to any of them. One account active at a time. |
| **Persistence** | ComfyUI: `custom_nodes`/`input`/`output`/`user` symlinked to a volume. AI Toolkit: `output`/`datasets`/`db` + training checkpoints persisted. All survive cold starts. |
| **Reset / switch** (ComfyUI) | "Reset custom_nodes" wipes Manager-installed nodes back to baseline. Account switch wipes volume dirs for a clean handover. (AI Toolkit switch not yet supported.) |
| **Live deploy logs** | Server-Sent Events stream `modal deploy` output to the UI with milestone tracking (both targets). |

## Development

```bash
npm install
npm run dev      # starts web (Vite) + server (Fastify) concurrently
```

- **Web UI:** http://localhost:5173 (proxies `/api` → backend)
- **Backend:** http://127.0.0.1:7421

```bash
npm run build     # build all workspaces (shared → web → server)
npm run typecheck # tsc -b
```

## Project layout

```
apps/web/                       React + Vite + TypeScript + Tailwind  (the UI)
  src/pages/                    Setup, Keys, Configure, Workflows, Deploy, Launch
  src/store/appStore.ts         Zustand store w/ localStorage persistence
apps/server/                    Fastify + TypeScript                  (local backend)
  src/modal/cli.ts              Renders the right template per target, runs modal deploy
  src/modal/packs.ts            Core nodes + per-pack nodes/models (ComfyUI)
  src/accounts/modal.ts         Modal token validation, profile activation, secrets
  src/routes/                   instances, accounts, workflows, events (SSE)
  templates/comfyapp.py.tpl     ComfyUI template — rendered per deploy
  templates/aitoolkit_app.py.tpl  AI Toolkit (ostris/ai-toolkit) template
  templates/aitoolkit-config/   Bundled training configs (base64-inlined into the image)
  workflows/                    wan22/ image-edit/ upscaling/ (ComfyUI workflow JSONs)
packages/shared/                Shared TS types (Account, Instance, DeployConfig, DeployTarget…)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design,
[docs/CONFIGURATION.md](docs/CONFIGURATION.md) for every tunable, and
[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) for the detailed walkthrough.

## How it works (under the hood)

1. You pick hardware + packs in the **Configure** step.
2. On **Deploy**, the server renders `comfyapp.py.tpl` — substituting `{{GPU}}`,
   `{{MEMORY_MB}}`, `{{NODE_CLONES}}`, `{{EXTRA_MODELS}}`, `{{WORKFLOW_BUNDLE}}`, etc. — into a
   complete Modal app (`comfyapp.py`), validates it with `ast.parse`, then runs `modal deploy`.
3. Modal builds the image (Debian + ComfyUI + your selected custom nodes + bundled workflow JSONs
   base64-inlined into the image).
4. The `ui` function mounts a `wan-models` volume, symlinks `models/`, `custom_nodes/`, `input/`,
   `output/`, `user/` onto it (seeding from the image on first boot), spawns ComfyUI, and blocks
   until it answers HTTP — so the URL is never handed out before ComfyUI is ready.
5. Modal returns a `*.modal.run` URL, captured and shown in the **Launch** step.

`★ Insight` — models download once (via a Prefetch step) into the volume, so cold starts just
re-create symlinks (seconds, not the original 15–30 min). Persistent dirs use the same trick:
first boot seeds from the image; later boots find the symlinks already in place.

## License

MIT — see [LICENSE](LICENSE).
