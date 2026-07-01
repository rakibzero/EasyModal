# Wan2.2Animate Deploy

> **Modal is powerful but miserable to set up. This is the missing UI.**

Deploy [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on [Modal](https://modal.com) by
pasting your API keys and clicking one button. No terminal, no Python, no fighting the CLI.
Pick your GPU, RAM, and CPU; choose which workflow packs to bundle; deploy to any of several
Modal accounts — all from a local web UI.

This is an open-source project: anyone should be able to run ComfyUI on cloud GPUs without
the suffering that Modal's server setup normally demands.

## Status

✅ **Functional.** Real deploys verified end-to-end — ComfyUI loads live on Modal with all
bundled custom nodes, the Manager, and workflow templates.

## What it does

1. Run one command (`npm start`).
2. Paste your **Modal token** + **HuggingFace token** (add as many Modal accounts as you like).
3. **Configure** — pick GPU (A100-80GB, H100, L40S, …), RAM, vCPUs, concurrency, timeout, and
   which **workflow packs** to bundle (Wan2.2 Animation, Image Editing, Upscaling).
4. Click **Deploy** — the app renders a ComfyUI-on-Modal template, runs `modal deploy`, and
   streams live progress (image build → model download → ComfyUI startup → URL ready).
5. Click **Open ComfyUI** 🚀 — you're animating.

Compute stays on **your** Modal account. This app is a local orchestrator + UI; it never hosts
compute itself. Installed custom nodes, uploaded inputs, generated outputs, and saved workflows
**persist across container restarts** via a Modal Volume.

## Quickstart

```bash
git clone <repo>
cd Wan2.2Animate
npm install
npm start
```

Your browser opens automatically. Click through **Setup → Keys → Configure → Workflows → Deploy → Launch**:
paste your Modal + HuggingFace tokens, choose your hardware + packs, click **Deploy ComfyUI to Modal**,
then **Open ComfyUI** 🚀.

> Requires Node 18+ and the `modal` CLI installed (`pip install modal && modal setup`).

## Key features

| Feature | What it means |
|---------|---------------|
| **Hardware config** | Pick GPU (7 options w/ VRAM guardrails), RAM (8–256 GB), vCPU (2–32), max concurrency (1–4), idle timeout (15–240 min), app name. |
| **Workflow packs** | Toggle bundles of custom nodes + models: **Wan2.2 Animation** (core, always on), **Image Editing** (Flux/Qwen/Ernie), **Upscaling** (SUPIR/SeedVR). |
| **Bundled workflows** | 28 workflow JSONs ship in the image and appear in ComfyUI's workflow menu, organized by pack. |
| **Multiple accounts** | Add unlimited Modal accounts, deploy to any of them. One account active at a time. |
| **Persistence** | `custom_nodes`, `input`, `output`, `user` dirs are symlinked onto a Modal Volume. Manager installs, uploads, outputs, and saved workflows survive cold starts. |
| **Reset / switch** | "Reset custom_nodes" wipes Manager-installed nodes back to baseline. Account switch wipes volume dirs for a clean handover. |
| **Live deploy logs** | Server-Sent Events stream `modal deploy` output to the UI with milestone tracking. |

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
apps/web/                    React + Vite + TypeScript + Tailwind  (the UI)
  src/pages/                 Setup, Keys, Configure, Workflows, Deploy, Launch
  src/store/appStore.ts      Zustand store w/ localStorage persistence
apps/server/                 Fastify + TypeScript                  (local backend)
  src/modal/cli.ts           Renders comfyapp.py.tpl, runs modal deploy
  src/modal/packs.ts         Core nodes + per-pack nodes/models definitions
  src/accounts/modal.ts      Modal token validation, profile activation
  src/routes/                instances, accounts, workflows, events (SSE)
  templates/comfyapp.py.tpl  THE template — rendered per deploy
  workflows/                 wan22/ image-edit/ upscaling/ (bundled JSONs)
packages/shared/             Shared TS types (Account, Instance, DeployConfig…)
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
