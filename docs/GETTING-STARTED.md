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
git clone <repo-url> wan22-animate
cd wan22-animate
npm install
npm start
```

Your browser opens at **http://localhost:5173**. (In dev: `npm run dev` — web on 5173, server on 7421.)

> The app runs entirely on your machine. It stores your tokens locally
> (`~/.wan22-deploy/`, 0600) and never sends them anywhere except Modal/HuggingFace over HTTPS.

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

Pick your hardware and which workflow packs to bundle:

- **App name** — becomes the Modal app name.
- **GPU** — A100-80GB (default), H100, H200, L40S, L4, T4. The UI warns if you pick a GPU too small
  for Wan2.2 (needs ≥40 GB VRAM).
- **RAM** (8–256 GB), **vCPU** (2–32), **Max concurrent inputs** (1–4), **Idle timeout** (15–240 min).
- **Workflow packs** — `wan22` (always on), plus optional `image-edit` and `upscaling`. Each pack
  adds custom nodes + models to the image.

These choices persist across sessions (localStorage) and are sent with every deploy.

## 5. Workflows (optional browse)

A read-only catalog of the 28 bundled workflow JSONs, grouped by pack. Download any to inspect or
share. They're already baked into the image on deploy, so no action needed here to use them.

## 6. Deploy

1. Pick the account to deploy to.
2. Review the config summary card.
3. Click **Deploy ComfyUI to Modal**.

The app renders `comfyapp.py.tpl` with your choices, validates it as Python, then runs `modal deploy`.
You'll see live, streamed progress with milestones:

- **Building container image** — Debian + ComfyUI + your selected custom nodes + bundled workflows.
  First build ~5–10 min.
- **Downloading models** — ~40 GB of Wan2.2 models into the `wan-models` volume. **First deploy
  only** — subsequent deploys skip this (volume cache). 15–30 min on first run.
- **Starting ComfyUI** — symlinks models + persistent dirs onto the volume, spawns ComfyUI,
  health-polls until it answers HTTP.
- **Deployment ready** — the real `*.modal.run` URL is captured (never guessed).

## 7. Launch

Click **🚀 Open ComfyUI**. You're in. Load a workflow from the menu, drop in an image, and animate.

### What persists across restarts

Because `custom_nodes`, `input`, `output`, and `user` are symlinked onto the `wan-models` volume:

- **ComfyUI Manager installs** survive container recycles — install once, keep forever.
- **Uploaded inputs** (your source images/clips) stay.
- **Generated outputs** stay.
- **Saved workflows + settings** stay.

The container can scale to zero and wake back up with everything intact.

## Managing instances (Launch step)

Each card on the Launch step represents a deployed instance:

- **Refresh** — re-checks status via `modal app list`.
- **Copy link** — copies the `*.modal.run` URL.
- **Reset custom_nodes** — wipes Manager-installed nodes back to the image baseline. Use this if a
  bad install breaks ComfyUI. Models/uploads/outputs are untouched.
- **Redeploy** — go back to Deploy with the same config.
- **Remove** — removes the instance from the local list (does **not** delete the Modal app; run
  `modal app stop <name>` for that).

### Switching accounts

Use **Switch account** to hand off to another Modal account. It wipes `custom_nodes`/`input`/
`output`/`user` on the volume so the next account starts clean (models are kept — they're large and
account-independent), then activates the new account's token.

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
