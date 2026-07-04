# Getting Started

Deploy ComfyUI on Modal cloud GPUs from a browser UI — zero to animating in a few clicks.
This guide walks through the six-step flow: **Setup → Keys → Configure → Workflows → Deploy → Launch**.

## Prerequisites

- **Node.js 18+** — to run the local app.
- **The `modal` CLI** — `pip install modal` (the app shells out to it). The Setup step checks it's present.
- **A [Modal](https://modal.com) account** — sign up for free credits. Grab a token id + secret from
  the [Modal token settings](https://modal.com/settings/tokens).
- **A [HuggingFace](https://huggingface.co) account** — model downloads need a read token from
  [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). (Some Wan2.2 repos are
  gated — accept the license on the repo page first.)

## 1. Start the app

```bash
git clone <repo-url> easymodal
cd easymodal
npm install
npm start
```

Your browser opens at **http://localhost:5173**. (In dev: `npm run dev` — web on 5173, server on 7421.)

> The app runs entirely on your machine. It stores your tokens locally
> (`~/.easymodal/`, 0600) and never sends them anywhere except Modal/HuggingFace over HTTPS.

## 2. Setup

The first screen checks your environment: Node version and that the `modal` CLI is installed and
recent enough. Fix anything flagged, then continue.

## 3. Keys

Add one or more Modal accounts:

- **Label** — a friendly name ("personal", "work").
- **Modal token id** (`ak-…`) + **token secret** (`as-…`).
- **HuggingFace token** (`hf_…`, optional but recommended).

Click **Validate** to confirm each token works before saving. The app:

- Validates the Modal token by writing it to a throwaway profile and running `modal profile current`.
- Pushes your HF token to a Modal secret named `huggingface` on the active account
  (`modal secret put huggingface HF_TOKEN=…`).

You can add multiple accounts and deploy to any of them. **One account is active at a time.**

## 4. Configure

First pick **what to deploy**, then your hardware:

- **Target** — **ComfyUI** (image/video generation) or **AI Toolkit** (LoRA fine-tuning via
  [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit)). This drives which template is
  rendered and which Modal volume/secrets are used.
- **App name** — becomes the Modal app name (defaults to `easymodal` for ComfyUI,
  `ai-toolkit-finetune` for AI Toolkit).
- **GPU** — A100-80GB (default), H100, H200, L40S, L4, T4. The UI warns if you pick a GPU too small
  for Wan2.2 (needs ≥40 GB VRAM). Applies to both targets.
- **RAM** (8–256 GB), **vCPU** (2–32), **Max concurrent inputs** (1–4), **Idle timeout** (15–240 min).
- **Workflow packs** (ComfyUI only) — `wan22` (always on), plus optional `image-edit` and
  `upscaling`. Each pack adds custom nodes + models to the image. Hidden when target=AI Toolkit.

These choices persist across sessions (localStorage) and are sent with every deploy.

## 5. Workflows (optional browse)

A read-only catalog of the 28 bundled workflow JSONs, grouped by pack. Download any to inspect or
share. They're already baked into the image on deploy, so no action needed here to use them.

## 6. Deploy

1. Pick the account to deploy to.
2. Review the config summary card (it shows the target, hardware, and — for ComfyUI — packs).
3. Click **Deploy** (the button label reflects your target: "Deploy ComfyUI to Modal" or
   "Deploy AI Toolkit to Modal").

The app renders the matching template (`comfyapp.py.tpl` or `aitoolkit_app.py.tpl`), validates it
as Python, then runs `modal deploy`. For AI Toolkit, an `ai-toolkit-auth` secret is auto-created
first and the access token is logged. You'll see live, streamed progress with milestones:

- **Building container image** — first build ~5–10 min (ComfyUI) or ~10–15 min (AI Toolkit, which
  also builds the Next.js UI).
- **Downloading models** — ComfyUI: ~40 GB of Wan2.2 models into the `wan-models-{accountId}`
  volume. AI Toolkit: ~71 GB (LTX-2.3 + Gemma3 encoder) into `ai-toolkit-{accountId}`.
  **First deploy per account** — subsequent deploys to the same account skip this (volume cache).
  Modal's HF cache mirror makes the actual transfer fast (~seconds once the files are warm in-region).
- **Starting app server** — ComfyUI: symlinks + spawns ComfyUI + health-polls. AI Toolkit: Prisma
  DB push + model cache check + Next.js on port 8675.
- **Deployment ready** — the real `*.modal.run` URL is captured (never guessed).

## 7. Launch

Click **🚀 Open**. You're in — load a workflow (ComfyUI) or start a training job (AI Toolkit).

> **AI Toolkit auth:** the UI is gated by `AI_TOOLKIT_AUTH`. On first AI Toolkit deploy a token
> is generated, **persisted to your account** (`aiToolkitAuthToken` in `~/.easymodal/config.json`),
> and printed in the deploy log stream — copy it. The same token is reused on every subsequent
> deploy, so your ModHeader config stays stable. You'll need it (along with Modal proxy auth
> headers) to access the URL.

### What persists across restarts

Each Modal account has its **own isolated volume** (`wan-models-{accountId}` for ComfyUI,
`ai-toolkit-{accountId}` for AI Toolkit) — state never bleeds across accounts.

**ComfyUI** — `custom_nodes`, `input`, `output`, and `user` are symlinked onto the volume:

- **ComfyUI Manager installs** survive container recycles — install once, keep forever.
- **Uploaded inputs** (your source images/clips) stay.
- **Generated outputs** stay.
- **Saved workflows + settings** stay.

**AI Toolkit** — `output`, `datasets`, and the Prisma job-queue DB are symlinked onto the
volume, and the safety patches (atomic saves + periodic volume commits) keep
training checkpoints resumable across container preemption.

The container can scale to zero and wake back up with everything intact.

## Managing instances (Launch step)

Each card on the Launch step represents a deployed instance. The card shows the target
(ComfyUI or AI Toolkit), account, GPU, and a live status dot.

- **Refresh** — re-checks status via `modal app list`.
- **Copy link** — copies the `*.modal.run` URL.
- **Reset custom_nodes** *(ComfyUI only)* — wipes Manager-installed nodes back to the image
  baseline. Hidden for AI Toolkit instances (no custom_nodes). Use this if a bad install breaks
  ComfyUI. Models/uploads/outputs are untouched.
- **Redeploy** — go back to Deploy with the same config.
- **Remove** — removes the instance from the local list (does **not** delete the Modal app; run
  `modal app stop <name>` for that).

### Switching accounts

Use **Switch account** to rebind an instance to another Modal account. It activates the new
account's Modal profile and rebinds the instance — that's it. **No wipe is needed** because each
account has its own isolated volume (`wan-models-{accountId}` / `ai-toolkit-{accountId}`); the
new account's next deploy targets its own fresh volume with zero bleed from the previous account.
Works for both ComfyUI and AI Toolkit instances.

## Common issues

### Deploy fails: "Required model download(s) failed"

Your HF token can't reach a model. Either the token is invalid, or the repo is gated and you
haven't accepted its license on huggingface.co. Required models abort the deploy so you don't get a
broken image — fix the token/access in Keys and redeploy.

### First deploy takes 30+ minutes

Normal — 40 GB of models download once into the volume. Subsequent deploys skip the download.
You're only billed for compute while a container is running; the volume storage cost is minimal.

### "URL loads for hours" after deploy

This was a known bug (fixed). The `ui()` function now health-polls ComfyUI until it answers HTTP
before returning, so Modal never publishes the URL prematurely. If you still see it, the container
may be downloading models on a fresh volume — wait for the first cold start to finish.

### ComfyUI loads but a workflow shows "model not found"

You likely enabled a pack whose model repo path is wrong (pack model paths are best-effort). The
model failed to download (`required: false`, so it warned but didn't abort). Check the deploy log
for `FAIL:` lines, find the right repo/path, and update `apps/server/src/modal/packs.ts`.

## Next steps

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the local app + Modal deploy fit together.
- **[CONFIGURATION.md](CONFIGURATION.md)** — every tunable, template placeholders, pack definitions.
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — running locally, building, linting.
