# Architecture

## System Overview

EasyModal is a **local orchestrator + web UI** that deploys [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
on [Modal](https://modal.com) serverless GPUs. The user interacts only with a browser-based UI
served from their own machine; compute runs on their own Modal account.

The system has two halves:

1. **Local app** (this repo) — an npm-workspaces monorepo: a React/Vite frontend and a Fastify
   backend. The backend renders a Python template, shells out to the `modal` CLI, and streams
   progress back over SSE.
2. **Deployed ComfyUI** (on Modal) — built from the rendered `comfyapp.py`. A custom Modal Image
   bundles ComfyUI + selected custom nodes + workflow JSONs; a `wan-models` Volume persists
   models and user state across cold starts.

**Architectural style**: local orchestrator driving serverless container deploys, with a
persistent-volume-backed symlink layer for state that survives container recycling.

## High-level diagram

```mermaid
graph TD
    subgraph "Local machine (this repo)"
        U["User<br/>(browser)"]
        W["apps/web<br/>React + Vite"]
        S["apps/server<br/>Fastify + SSE"]
        CS["~/.easymodal/<br/>config.json, instances.json<br/>(0600 plaintext key store)"]
    end

    subgraph "Render + deploy"
        T["comfyapp.py.tpl<br/>+ packs.ts"]
        R["renderTemplate()<br/>ast.parse validation"]
        MCLI["modal CLI<br/>(deploy / run / app list)"]
    end

    subgraph "Modal cloud (per account)"
        APP["modal.App<br/>wan22-animate"]
        IMG["modal.Image<br/>Debian + ComfyUI + nodes + workflows"]
        UI["@modal.web_server :8188"]
        DL["download_all_models<br/>(Prefetch)"]
        VOL["modal.Volume<br/>wan-models"]
        RESET["reset_custom_nodes /<br/>wipe_account_dirs"]
    end

    U -->|HTTP /api| W
    W -->|proxy /api| S
    S -->|read/write creds| CS
    S -->|render| R
    T --> R
    R -->|comfyapp.py| MCLI
    MCLI -->|deploy| APP
    APP --- IMG
    APP --- UI
    APP --- DL
    APP --- RESET
    UI -.->|mount| VOL
    DL -.->|mount| VOL
    RESET -.->|mount| VOL
    S -->|stream stdout| U
```

## Component breakdown

### apps/web (frontend)

- **Stack:** React 18, Vite 6, TypeScript 5.7, Tailwind CSS v4, Zustand.
- **Pages** (`src/pages/`), one per step in the flow:
  - `SetupPage` — environment prerequisites check (Node version, `modal` CLI presence/version).
  - `KeysPage` — add/remove Modal accounts (each = label + Modal token id/secret + optional HF token),
    shows masked tokens + HF status. Calls `/api/accounts`.
  - `ConfigurePage` — hardware dropdowns (GPU/RAM/vCPU/concurrency/timeout/app name) + workflow-pack
    toggles. Persisted to `localStorage` (`easymodal-config`).
  - `WorkflowsPage` — browses the bundled workflow catalog (`/api/workflows`), grouped by pack,
    with download buttons.
  - `DeployPage` — account picker + config summary + deploy button. Streams milestones via SSE.
  - `LaunchPage` — lists all instances across accounts, with the live `*.modal.run` URL, Refresh,
    Copy link, Reset custom_nodes, Redeploy, Remove actions.
- **State:** `src/store/appStore.ts` (Zustand). Holds the current step, deploy config, and log
  buffer; persists to `localStorage`.
- **SSE:** `src/api/client.ts` `subscribeEvents()` opens an `EventSource` on `/api/events` and
  feeds every deploy log line + milestone into the store.

### apps/server (backend)

- **Stack:** Fastify 5, pino logging, TypeScript.
- **Entry:** `src/main.ts` — finds a free port (default `7421`, override via `PORT`), registers
  routes, serves the built web bundle in production, auto-opens the browser.

#### Route modules (`src/routes/`)

| Route file | Endpoints | Purpose |
|-----------|-----------|---------|
| `health.ts` | `GET /api/health` | Liveness probe. |
| `prereqs.ts` | `GET /api/prereqs` | Checks Node version + `modal` CLI path/version. |
| `accounts.ts` | `GET/POST /api/accounts`, `DELETE /api/accounts/:id`, `POST /api/accounts/validate(-hf)` | Add/remove/validate Modal + HF tokens. |
| `instances.ts` | `GET/POST /api/instances`, `DELETE /api/instances/:id`, `POST /api/instances/deploy`, `POST /api/instances/:id/refresh`, `POST /api/instances/:id/reset-nodes`, `POST /api/instances/:id/switch-account` | Deploy, list, refresh status, reset nodes, switch account. |
| `workflows.ts` | `GET /api/workflows`, `GET /api/workflows/:pack/:filename` | Browse/download bundled workflow JSONs. |
| `events.ts` | `GET /api/events` | SSE stream (`reply.hijack()`). |

#### Modal layer (`src/modal/`)

- **`cli.ts`** — the rendering core.
  - `renderTemplate(cfg)` reads `templates/comfyapp.py.tpl` and substitutes placeholders:
    `{{APP_NAME}}`, `{{GPU}}`, `{{MAX_INPUTS}}`, `{{TIMEOUT_SECONDS}}`, `{{MEMORY_MB}}`, `{{CPU}}`,
    `{{NODE_CLONES}}`, `{{EXTRA_MODELS}}`, `{{WORKFLOW_BUNDLE}}`.
  - `renderNodeClones(nodes)` → `.run_commands("cd …/custom_nodes && git clone URL[ && cd X && pip install -r requirements.txt]")` per node.
  - `renderExtraModels(models)` → Python tuples appended to the `MODELS` list.
  - `renderWorkflowBundle(workflows)` → base64-inlines each workflow JSON into
    `.run_commands("… | base64 -d > …/user/default/workflows/<file>")` (Modal Image can't `ADD_CONTEXT`
    local files without a Dockerfile, so content is inlined).
  - `deployRenderedTemplate(cfg, cb)` writes the rendered file to a temp dir and spawns
    `modal deploy comfyapp.py`, streaming stdout/stderr line-by-line to callbacks.
- **`packs.ts`** — pack definitions.
  - `CORE_NODES`: 25 always-installed custom nodes (VideoHelperSuite, WanVideoWrapper, KJNodes,
    ComfyUI-Manager, Impact-Pack, SCAIL-Pose, WanAnimatePlus, …).
  - `PACKS`: `wan22` (core, empty extras), `image-edit` (Flux/Qwen/Ernie nodes + models),
    `upscaling` (SUPIR/SeedVR nodes + models).
  - `resolveNodes(packs)` / `resolveModels(packs)` dedupe + concatenate.
- **`milestones.ts`** — classifies raw `modal deploy` log lines into milestones
  (`image-building`, `models-downloading`, `comfyui-starting`, `url-ready`, `failed`) shown in the UI.

#### Accounts (`src/accounts/modal.ts`)

Thin wrappers over the `modal` CLI via `execFile`:

- `validateModalToken(id, secret)` — `modal token set` into a throwaway `easymodal-validate` profile,
  then `modal profile current` to confirm.
- `persistModalToken(id, secret)` — writes the token under the real profile.
- `activateAccountProfile(accountId, id, secret)` — writes the token under `easymodal-<accountId>` and
  marks it active. Called before every deploy / reset / switch so the right account is targeted.
- `setHuggingFaceSecret(token)` — `modal secret put huggingface HF_TOKEN=…` (idempotent).

> **Concurrency model:** one account active at a time. The active profile lives in `~/.modal.toml`.
> Account switching is serialized through the UI. (Per-account config-file isolation via
> `MODAL_CONFIG_PATH` is a documented future option if concurrent multi-account deploys are needed.)

#### Persistence layer (`src/repo/`)

- `configStore.ts` — `~/.easymodal/config.json` (0600). Stores accounts (with HF tokens) and
  the `activeAccountId`. Plaintext by design — matches `modal`/`aws`/`git` CLI conventions.
  Override location with `EASYMODAL_CONFIG_DIR`.
- `instances.ts` — `~/.easymodal/instances.json` (0600). Stores deployed-instance records
  (id, accountId, appName, config, status, url, timestamps, lastError).

### packages/shared

Shared TypeScript types consumed by both web and server: `Account`, `InstanceStatus`,
`DeployConfig`, `GpuOption` + `GPU_OPTIONS`, `RAM_OPTIONS_GB`, `CPU_OPTIONS`,
`TIMEOUT_OPTIONS_MIN`, `WorkflowPack` + `WORKFLOW_PACKS`, `LogEvent`, `Milestone`.

## The deployed ComfyUI app (the template)

`apps/server/templates/comfyapp.py.tpl` is the heart of the product. It is **rendered per-deploy**,
not edited directly. Rendered output is a complete Modal app.

### CONFIG (single source of truth, rendered from placeholders)

```python
CONFIG = {
    "app_name": "{{APP_NAME}}",
    "gpu": "{{GPU}}",
    "max_inputs": {{MAX_INPUTS}},
    "timeout_seconds": {{TIMEOUT_SECONDS}},
    "memory_mb": {{MEMORY_MB}},
    "cpu": {{CPU}},
}
```

### Image build (ordered layers)

1. `debian_slim(python_version="3.11")` base.
2. `apt_install` — git, wget, ffmpeg, libgl1, libglib2.0-0, libsm6, libxext6, libxrender-dev, libfontconfig.
3. `uv_pip_install` — fastapi, comfy-cli, boto3, huggingface-hub.
4. `run_commands` — `comfy --skip-prompt install --fast-deps --nvidia --skip-manager`.
5. `run_commands` — `pip install sageattention` (best-effort).
6. **`{{NODE_CLONES}}`** — one `.run_commands(...)` per custom node (core + selected packs).
7. `uv_pip_install` — numpy, transformers, ninja, safetensors, onnxruntime-gpu, opencv-headless,
   scipy, einops, accelerate, imageio, imageio-ffmpeg.
8. **`{{WORKFLOW_BUNDLE}}`** — base64-inline each bundled workflow JSON into
   `/root/comfy/ComfyUI/user/default/workflows/`.

### Volume + persistence

```python
vol = modal.Volume.from_name("wan-models", create_if_missing=True)
CACHE_DIR = "/cache"
VOL_MODELS = f"{CACHE_DIR}/models"
```

Four directories are symlinked onto the volume so they survive cold starts:

| ComfyUI path | Volume path | Survives restarts? |
|--------------|-------------|--------------------|
| `models/` | `/cache/models` | Yes (prefetched by `download_all_models`) |
| `custom_nodes/` | `/cache/custom_nodes` | Yes (Manager installs persist) |
| `input/` | `/cache/input` | Yes (uploaded images/clips) |
| `output/` | `/cache/output` | Yes (generated images/videos) |
| `user/` | `/cache/user` | Yes (saved workflows, settings) |

`_link_to_volume(name, comfy_path, vol_path, image_baseline=...)`:
- If the volume dir is empty AND an image baseline exists (custom_nodes), it copies the image-baked
  baseline in — **even when the symlink already exists**. This is the re-seed path taken after a
  reset/switch wipe; without it, a wiped volume would stay empty forever.
- If `comfy_path` is already a symlink, the link is in place → done (warm boot).
- Otherwise it seeds the volume from the on-image dir, then replaces the dir with a symlink.

`ensure_persistent_dirs()` runs all four through `_link_to_volume` on every cold start.

### Functions

| Function | Purpose | GPU | Mounts volume |
|----------|---------|-----|---------------|
| `download_all_models()` | Prefetch all models to the volume (the "Prefetch" step). First run 15–30 min. | none (CPU) | Yes |
| `ui()` | `@modal.web_server(8188)`. Symlinks models + persistent dirs, spawns ComfyUI, **blocks until it answers HTTP** (closes the "URL handed out before ComfyUI is ready" gap). | `CONFIG["gpu"]` | Yes |
| `reset_custom_nodes()` | Wipes `/cache/custom_nodes` back to image baseline. Next cold start re-seeds. | none | Yes |
| `wipe_account_dirs()` | Wipes `custom_nodes`/`input`/`output`/`user` for an account switch. Models kept. | none | Yes |
| `main()` (local_entrypoint) | Runs `download_all_models.remote()` — used by `modal run comfyapp.py`. | — | — |

### The loading-fix

`ui()` does **not** call `download_models()` on every cold start (that caused the "URL loads for
hours" symptom — every cold container re-statted 30+ models while Modal's proxy held the browser
request). It only re-creates the model-dir symlinks (fast, idempotent) and health-polls ComfyUI
until it returns HTTP 200 before returning — so Modal never marks the container "ready" prematurely.

## Data flow: a deploy

1. User picks account + config + packs, clicks Deploy → `POST /api/instances/deploy`.
2. Server `activateAccountProfile(accountId, …)` so the right account is targeted.
3. `deployRenderedTemplate(cfg, callbacks)`:
   - Renders the template → temp `comfyapp.py`.
   - Spawns `modal deploy comfyapp.py`.
   - Each stdout/stderr line → `classifyLine()` → milestone → SSE event → UI.
   - On a `*.modal.run` URL in the output, captured into the instance record.
4. Modal builds the image (or reuses cached layers), starts the `ui` function.
5. `ui()` mounts the volume, symlinks dirs, spawns ComfyUI, health-polls, returns.
6. Modal publishes the HTTPS endpoint; the server captures the real URL (never guessed).
7. **Launch** step shows the URL; user clicks **Open ComfyUI** 🚀.

## Security model

- Keys stored in `~/.easymodal/` (0600 plaintext), never in the repo. `.gitignore` excludes `.env`.
- No encryption layer — by design, matching `modal`/`aws`/`git` CLI conventions. The threat model
  is "single-user local tool," not multi-tenant.
- Tokens are sent to Modal's API via the `modal` CLI over HTTPS; nothing leaves the machine except
  to Modal/HuggingFace.
- The deployed ComfyUI endpoint is a public Modal URL (no auth gate). Anyone with the link can use
  it. Treat the URL as a secret; use Modal's access controls if you need to lock it down.
