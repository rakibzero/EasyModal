# Wan2.2Animate Deploy

> **Modal is powerful but miserable to set up. This is the missing UI.**

Deploy [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on [Modal](https://modal.com) by
pasting two keys and clicking one button. No terminal, no Python, no fighting the CLI.

This is an open-source project: anyone should be able to run ComfyUI on cloud GPUs without
the suffering that Modal's server setup normally demands.

## Status

🚧 **In active development.** See [`.planning/ROADMAP.md`](.planning/ROADMAP.md) for the
full build plan (7 phases).

## What it does (vision)

1. Run one command (`npx wan22-deploy`).
2. Paste your **Modal token** + **HuggingFace token**.
3. Click **Deploy** — the app builds ComfyUI on Modal, streams live progress, and hands you
   the link.
4. Click **Open ComfyUI** 🚀 — you're animating.

Compute stays on **your** Modal account (A100-80GB). This app is a local orchestrator + UI;
it never hosts compute itself.

## Quickstart (coming soon)

```bash
npx wan22-deploy
```

> Requires Node 18+ and the `modal` CLI installed (`pip install modal`).

## Development

```bash
npm install
npm run dev      # starts web (Vite) + server (Fastify) concurrently
```

- **Web UI:** http://localhost:5173 (proxies `/api` → backend)
- **Backend:** http://127.0.0.1:7421

```bash
npm run build     # build all workspaces
npm run lint      # eslint
npm run typecheck # tsc -b
```

## Project layout

```
apps/web/        React + Vite + TypeScript + Tailwind  (the UI)
apps/server/     Fastify + TypeScript                  (local backend)
packages/shared/ Shared TS types (Account, Instance, LogEvent…)
```

## Roadmap

| Phase | Goal |
|-------|------|
| 1 | Project foundation & tooling |
| 2 | Backend skeleton (Fastify + SSE) |
| 3 | Frontend shell (React + Tailwind) |
| 4 | Encrypted key store & Keys UI |
| 5 | Deploy pipeline & clean ComfyUI template |
| 6 | Instance status & launch |
| 7 | Polish, docs & open-source release |

Future (v2): multiple Modal accounts, multiple instances, model/node/workflow libraries.

## License

MIT — see [LICENSE](LICENSE).

---

## Appendix: Bundled ComfyUI app

This repo also contains the brownfield `comfyapp.py` — a single-file Modal deployment of
ComfyUI with pre-downloaded Wan2.2 / SCAIL-2 / WanAnimate+ models. The Deploy app will
ship a **clean, refactored version** of this as its bundled template (see
[`.planning/PRODUCTION-PLAN.md`](.planning/PRODUCTION-PLAN.md) §4).

### Original ComfyUI-on-Modal usage

Deploys ComfyUI on [Modal](https://modal.com) with pre-downloaded models for Wan2.2 video
animation workflows — including Wan2.1, WanAnimate+, SCAIL-2, Bernini, and IPAdapter — on
A100-80GB GPUs.

**Prerequisites:** A [Modal](https://modal.com) account, a [HuggingFace](https://huggingface.co)
account with a read token, and the Modal CLI installed and authenticated.

```bash
# Create a Modal secret named `huggingface` with your HuggingFace token
modal secret create huggingface HF_TOKEN=hf_xxxx

# Pre-download all models to the `wan-models` volume (first run: 15-30 min)
modal run comfyapp.py

# Deploy the ComfyUI web server (port 8188)
modal deploy comfyapp.py
```

Once deployed, Modal provides a public HTTPS endpoint. Open it in a browser to access the
ComfyUI interface. Load a workflow from the `workflows/` directory to begin working.
