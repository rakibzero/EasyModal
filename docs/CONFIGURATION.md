# Configuration

EasyModal is configured through the **Configure** step in the web UI. The chosen values are
rendered into one of two templates at deploy time — `comfyapp.py.tpl` (ComfyUI) or
`aitoolkit_app.py.tpl` (AI Toolkit) — so there are no config files to hand-edit for a deploy.
Just pick options in the UI and click Deploy.

This document covers every tunable, where it lives, and how to change the defaults.

## Deploy target (which app gets deployed)

The first Configure choice is **"What do you want to deploy?"** — this drives which template
is rendered and which Modal volume/secrets are used.

| Target | Template | Volume (per account) | Port | Extra secrets |
|--------|----------|----------------------|------|---------------|
| **ComfyUI** (default) | `comfyapp.py.tpl` | `wan-models-{accountId}` | 8188 | `huggingface` |
| **AI Toolkit** | `aitoolkit_app.py.tpl` | `ai-toolkit-{accountId}` | 8675 | `huggingface` + `ai-toolkit-auth` (per-account) |

**Volumes are namespaced per Modal account** so each account has fully isolated state —
models, `custom_nodes`, `output`, `input`, and `user` dirs never bleed across accounts. The
volume name is built by `volumeNameFor(cfg)` in `cli.ts` from `cfg.accountId` (sanitized to
Modal's `^[a-z0-9-]+$` rule). Switching accounts targets a different volume on the next deploy.

`ai-toolkit-auth` is created on first AI Toolkit deploy (`ensureAiToolkitAuthSecret` in
`accounts/modal.ts`), **persisted per account** in `~/.easymodal/config.json`
(`aiToolkitAuthToken`), and reused on every subsequent deploy so your ModHeader config stays
stable. The token is logged to the deploy stream on first deploy only.

## At-a-glance: deploy-time options (the Configure step)

All of these are persisted to `localStorage` under the key `easymodal-config` and sent in the
`POST /api/instances/deploy` body as the `config` field. Defaults live in
`apps/web/src/store/appStore.ts` (`DEFAULT_CONFIG`) and `apps/server/src/modal/cli.ts`
(`DEFAULT_DEPLOY_CONFIG`).

| Option | Default | Applies to | Choices | Notes |
|--------|---------|-----------|---------|-------|
| **Target** | `comfyui` | both | `comfyui`, `ai-toolkit` | Picks the template. Swaps the app-name default. |
| **App name** | `easymodal` (comfyui) / `ai-toolkit-finetune` (ai-toolkit) | both | any slug | Becomes the Modal app name + part of the URL. |
| **GPU** | `A100-80GB` | both | A100-80GB, A100-40GB, H100, H200, L40S, L4, T4 | VRAM guardrail warns when a non-heavy-workload GPU is picked (Wan2.2 needs ≥40 GB). |
| **RAM** | 32 GB | both | 8, 16, 32, 64, 128, 256 GB | |
| **vCPU** | 8 | both | 2, 4, 8, 16, 32 | |
| **Max concurrent inputs** | 2 | comfyui | 1, 2, 3, 4 | Each Wan2.2 inference uses 30–50 GB VRAM; >1 risks OOM on a single GPU. (AI Toolkit overrides to 10.) |
| **Idle timeout** | 30 min | comfyui | 15, 30, 60, 120, 240 min | How long the container stays warm before scaling to zero. |
| **Workflow packs** | `wan22` | comfyui only | `wan22` (locked on), `image-edit`, `upscaling` | Add custom nodes + models per pack. Hidden when target=ai-toolkit. |

### GPU options reference

Defined in `packages/shared/src/types.ts` (`GPU_OPTIONS`). Each entry has `vramGb` and a
`heavyWorkloads` flag — the Configure page shows a warning when you pick a GPU with
`heavyWorkloads: false` (T4, L4, L40S), since Wan2.2 14B generally needs ≥40 GB VRAM.

| GPU | VRAM | heavyWorkloads |
|-----|------|----------------|
| A100-80GB | 80 GB | ✅ |
| A100-40GB | 40 GB | ✅ |
| H100 | 80 GB | ✅ |
| H200 | 141 GB | ✅ |
| L40S | 48 GB | ⚠️ borderline |
| L4 | 24 GB | ❌ |
| T4 | 16 GB | ❌ |

## Workflow packs

Defined in `apps/server/src/modal/packs.ts`.

### Core nodes (always installed)

`CORE_NODES` — 25 custom nodes installed on every deploy regardless of pack selection:

VideoHelperSuite, WanVideoWrapper, KJNodes, Custom-Scripts, rgthree-comfy, ComfyUI_Essentials,
was-node-suite-comfyui, cg-use-everywhere, Frame-Interpolation, RMBG, Inpaint-CropAndStitch,
fofr-toolkit, efficiency-nodes-comfyui, KayTool, WanAnimatePlus, WanAnimatePreprocess, SCAIL-Pose,
comfyui-scail2, SDPose-OOD, Swwan, segment-anything-2, GGUF, Impact-Pack, **Manager**, civitai-comfy-nodes.

### Packs

| Pack | Adds nodes | Adds models |
|------|-----------|-------------|
| `wan22` (always on) | — (core nodes cover it) | — (core models are in the template) |
| `image-edit` | FluxTrainer, GGUF, QwenImage, comfyui-ernie, FLUX.1-Tools, mixlab-nodes, adetailer | Flux dev fp8, Qwen-Image-Edit GGUF, Ernie |
| `upscaling` | SUPIR, seedVR, SUPIR-Wrapper | SUPIR-v0Q, SUPIR-v0F, SeedVR2 |

> **Caveat:** the pack model repos/paths are best-effort. They're all `required: false`, so a
> 404 warns but doesn't abort the deploy. If a pack's model fails, the workflow that needs it will
> show a missing-model error in ComfyUI. Verify repo paths when you first use a pack and PR fixes.

`resolveNodes(packs)` dedupes by URL; `resolveModels(packs)` concatenates. Both feed the template's
`{{NODE_CLONES}}` and `{{EXTRA_MODELS}}` placeholders.

## Bundled workflows

Workflow JSONs live in `apps/server/workflows/`, one folder per pack:

```
apps/server/workflows/
├── wan22/          10 files (Wan2.2 / SCAIL-2 / WanAnimate workflows)
├── image-edit/     13 files (Flux / Qwen / Ernie workflows)
└── upscaling/       5 files (SUPIR / SeedVR workflows)
```

On deploy, `collectWorkflows(packs)` reads each selected pack's folder and `renderWorkflowBundle()`
base64-inlines every JSON into the image so it appears in ComfyUI's workflow menu. Adding a workflow
= drop a JSON into the right folder + redeploy. The catalog is also browsable in the **Workflows**
step (`GET /api/workflows`) with per-file download.

## Template placeholders

`renderTemplate(cfg)` in `cli.ts` dispatches by `cfg.target` and renders the matching template.

### ComfyUI — `apps/server/templates/comfyapp.py.tpl`

| Placeholder | Replaced with | Rendered by |
|-------------|---------------|-------------|
| `{{APP_NAME}}` | app name string | direct `.replaceAll` |
| `{{VOLUME_NAME}}` | `wan-models-{accountId}` | `volumeNameFor(cfg)` (sanitized) |
| `{{GPU}}` | GPU type string | direct |
| `{{MAX_INPUTS}}` | int | direct |
| `{{TIMEOUT_SECONDS}}` | int | direct |
| `{{MEMORY_MB}}` | int | direct |
| `{{CPU}}` | int | direct |
| `{{NODE_CLONES}}` | one `.run_commands(...)` per node | `renderNodeClones(resolveNodes(packs))` |
| `{{EXTRA_MODELS}}` | Python tuples appended to `MODELS` | `renderExtraModels(resolveModels(packs))` |
| `{{WORKFLOW_BUNDLE}}` | one `.run_commands(...)` per workflow JSON (base64) | `renderWorkflowBundle(collectWorkflows(packs))` |

### AI Toolkit — `apps/server/templates/aitoolkit_app.py.tpl`

| Placeholder | Replaced with | Rendered by |
|-------------|---------------|-------------|
| `{{APP_NAME}}` | app name string | direct `.replaceAll` |
| `{{VOLUME_NAME}}` | `ai-toolkit-{accountId}` | `volumeNameFor(cfg)` (sanitized) |
| `{{GPU}}` | GPU type string | direct |
| `{{MEMORY_MB}}` | int | direct |
| `{{CPU}}` | int | direct |
| `{{CONFIG_BUNDLE}}` | one `.run_commands(...)` per bundled training YAML (base64) | `renderAiToolkitConfigBundle()` |

The AI Toolkit template has no packs/nodes/workflows — it's a standalone app based on the
original `aitoolkit_app.py` (atomic-save patches for resumable training, periodic volume
commits, Prisma SQLite DB persistence, LTX-2.3 video LoRA). Bundled training configs live in
`apps/server/templates/aitoolkit-config/` and land at `/root/ai-toolkit/config/` in the image.

> **Gotcha (learned the hard way):** placeholders that expand to multi-line code must sit at
> column 0 in the template (not indented), and must never appear inside a `#` comment line —
> otherwise the expansion lands at the wrong indent or inside a comment, breaking the
> parenthesized `image = (...)` chain.

The rendered output is passed through `assertNoJsTokensInPython()` (a regression guard — see
**Validation** below) before deploy. `accountId` is required on every `DeployConfig` to derive
the volume name; the server injects it from the request body's `accountId`.

## Accounts

Stored in `~/.easymodal/config.json` (0600 plaintext). Each account:

```json
{
  "id": "uuid",
  "label": "personal",
  "modalTokenId": "ak-…",
  "modalTokenSecret": "as-…",
  "huggingfaceToken": "hf_… (optional)",
  "createdAt": "ISO-8601"
}
```

- **One active account at a time** (`activeAccountId` in the same file).
- The active account's Modal token is written to `~/.modal.toml` under profile `easymodal-<accountId>`
  before every deploy/reset/switch (`activateAccountProfile`).
- HuggingFace tokens are pushed to a Modal secret named `huggingface` (`modal secret put huggingface
  HF_TOKEN=…`) on the active account — idempotent, so switching accounts overwrites it.
- **AI Toolkit auth tokens** are stored per account (`aiToolkitAuthToken`) and reused on every
  AI Toolkit deploy so ModHeader config stays stable.
- **Account switch** (`POST /api/instances/:id/switch-account`) is now a pure token swap — it
  activates the new account's Modal profile and rebinds the instance. No volume wipe is needed
  because each account has its own isolated volume (`wan-models-{accountId}` /
  `ai-toolkit-{accountId}`); the new account's next deploy targets a fresh volume with zero
  bleed from the previous account. Works for both ComfyUI and AI Toolkit.

Override the config directory with `EASYMODAL_CONFIG_DIR=/some/path`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `7421` | Backend listen port. The web dev server (5173) proxies `/api` here. |
| `EASYMODAL_CONFIG_DIR` | no | `~/.easymodal` | Where `config.json` / `instances.json` live. |
| `HF_TOKEN` | (set by Modal) | — | Provided to the deployed container via the `huggingface` Modal secret. You don't set this locally. |

> There is **no local `.env`** required to run the app. The `.env` in the repo (gitignored) only
> holds the maintainer's own tokens for manual `modal` testing — it is not loaded by the app.

## Deployed-container defaults (in the template)

These are the values inside `comfyapp.py.tpl` itself (not user-tunable from the UI):

| Setting | Value | Location |
|---------|-------|----------|
| Web server port | 8188 | `@modal.web_server(8188, …)` |
| Web server startup timeout | 1800 s | `startup_timeout=1800` |
| `download_all_models` timeout | 3600 s | `@app.function(…, timeout=3600)` |
| Health-poll deadline (loading-fix) | 300 s | inside `ui()` |
| Volume name | `wan-models-{accountId}` | `modal.Volume.from_name("{{VOLUME_NAME}}", create_if_missing=True)` — rendered per account |
| Volume mount point | `/cache` | `volumes={CACHE_DIR: vol}` |
| HuggingFace secret name | `huggingface` | `modal.Secret.from_name("huggingface")` |

To change these, edit `apps/server/templates/comfyapp.py.tpl` directly (they are not surfaced as UI options).

## Validation & deploy safety

EasyModal runs several guards around the deploy so failures are loud and actionable rather
than silent hangs:

- **JS→Python regression guard** (`assertNoJsTokensInPython` in `cli.ts`) — after rendering,
  the source is stripped of comments and string literals, then scanned for bare JS literals
  (`true`, `false`, `null`, `undefined`). These would be syntactically valid Python names
  that pass `ast.parse` but throw `NameError` at runtime (the `false` vs `False` bug that
  broke image-edit deploys). The guard throws at render time with the offending token.
- **Pre-flight HF secret check** (`verifyHuggingFaceSecret` in `accounts/modal.ts`) — before
  `modal deploy`, the deploy route runs `modal secret list` and confirms a `huggingface`
  secret exists on the active account. Without it, model downloads silently fall back to
  anonymous HF and hang or 401 mid-build. The check fails the deploy fast with an actionable
  "set your HF token in Keys" message.
- **Deploy timeout** (90 min, `DEPLOY_TIMEOUT_MS` in `cli.ts`) — `modal deploy` has no
  user-facing timeout, so a stuck model download would leave the UI at "downloading" forever.
  The spawned child is SIGTERM'd at the deadline and the deploy is marked failed with a
  timeout message.
- **Failure = exit code only** — stderr lines containing "error" / "failed" / "exception"
  are surfaced as warnings but no longer flip the deploy to `failed`, because pip/Python/Comfy
  emit benign lines matching those words ("0 errors", deprecation warnings). The authoritative
  failure signal is `modal deploy` exiting non-zero.
- **UTF-8 forced on every Modal CLI spawn** (`modalEnv()` in `modal/env.ts`) — sets
  `PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`, and locale env vars so the child never inherits
  the system ANSI codepage (which on Windows crashes with `'charmap' codec can't encode`).

## Per-environment overrides

There is no `.env.development` / `.env.production` split. To run separate environments:

1. **Different Modal accounts** — add a second account in Keys, switch to it. Each account is its
   own Modal workspace, so apps/volumes/secrets are isolated by account.
2. **Different app names** — change the app name in Configure to avoid clashing with a production
   deploy (Modal app names are unique per workspace).
3. **Different config dir** — `EASYMODAL_CONFIG_DIR=/tmp/wan22-staging npm start` to keep a separate
   set of accounts/instances.
