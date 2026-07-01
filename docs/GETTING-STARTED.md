<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide walks you through deploying ComfyUI with Wan2.2 video animation models on [Modal](https://modal.com) cloud GPUs — from zero to running workflows in under 30 minutes.

## Prerequisites

Before you begin, make sure you have:

- **Python 3.11+** — the deployment runs on Modal's Debian slim Python 3.11 image
- **A [Modal](https://modal.com) account** — sign up for free credits at modal.com
- **A [HuggingFace](https://huggingface.co) account** — model downloads require a read token
- **Modal CLI** — installed via pip (see below)
- **Modal credentials** — authenticated via `modal token set` or `modal setup`

## Installation Steps

### 1. Install and authenticate the Modal CLI

```bash
pip install modal
modal token set
```

The `modal token set` command will prompt you for your token ID and token secret from the [Modal Dashboard](https://modal.com/settings/tokens). Alternatively, run `modal setup` for the guided authentication flow.

### 2. Clone the repository

```bash
git clone <repo-url> wan22-animate
cd wan22-animate
```

<!-- VERIFY: Replace `<repo-url>` with the actual repository URL from your Git hosting provider. -->

### 3. Create the HuggingFace secret

Model downloads require an authenticated HuggingFace token. Create a Modal secret named `huggingface` with your token:

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

Replace `hf_your_token_here` with your actual HuggingFace read token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

> **Why this is needed:** The `download_models()` function in `comfyapp.py` uses `huggingface_hub` to download model files from HuggingFace. Without a valid `HF_TOKEN`, downloads will fail silently.

### 4. Pre-download all models (optional, recommended)

Before deploying the web UI, pre-download all models to the `wan-models` Modal Volume:

```bash
modal run comfyapp.py
```

This runs the `download_all_models()` function on a CPU worker. It downloads and symlinks ~30+ model files (diffusion models, text encoders, VAEs, LoRAs, SAM, ONNX, NLF) into the ComfyUI `models/` directory, all cached in the `wan-models` volume.

- **First run:** Takes **15–30 minutes** depending on your Modal region and network speed.
- **Subsequent runs:** Seconds — the volume cache means only missing models are fetched.

You can skip this step and let the web server download models on first startup instead. However, pre-downloading is recommended so that the web server starts faster and you can confirm your `HF_TOKEN` works early.

## First Run

### Deploy the ComfyUI web server

```bash
modal deploy comfyapp.py
```

This command:

1. **Builds the container image** (~5–10 minutes on first run) — installs system packages, ComfyUI, 25+ custom nodes, and Python dependencies.
2. **Downloads models** (if you skipped the pre-download step, this happens now; ~10–20 minutes).
3. **Starts ComfyUI** on port 8188.

Once the deployment succeeds, Modal prints a public HTTPS endpoint. It looks like:

```
https://wan22-animate-scail2--ui.modal.run
```

Open that URL in your browser. You should see the ComfyUI interface.

### Run a workflow

1. In ComfyUI, drag a workflow JSON from the `workflows/` directory onto the canvas (or use ComfyUI's Load button).
2. Adjust any parameters as needed (e.g., prompt text, seed, steps).
3. Click **Queue Prompt** to generate.

The `workflows/` directory includes 10 pre-configured workflows:

| Workflow | Description |
|----------|-------------|
| `SCAIL-2_Animation.json` | SCAIL-2 video animation |
| `SCAIL-2_Animation_multi-char.json` | Multi-character SCAIL-2 animation |
| `SCAIL-2_Animation_multi-ref.json` | Multi-reference SCAIL-2 animation |
| `SCAIL-2_Animation_WAN-Context-Windows.json` | Context-window based SCAIL-2 animation |
| `SCAIL-2_Replacement.json` | SCAIL-2 inpainting / object replacement |
| `SCAIL2_simple.json` | Simplified SCAIL-2 workflow |
| `SCAIL2_multi_ref.json` | Multi-reference SCAIL-2 workflow |
| `Wananimate.json` | WanAnimate+ workflow |
| `example_workflow_001.json` | General example workflow |
| `example_workflow_bernini.json` | Bernini workflow |

## Redeploying After Changes

If you modify `comfyapp.py` (e.g., add a custom node, change GPU type, add a model), redeploy:

```bash
modal deploy comfyapp.py
```

**Redeploy speed:** The container image rebuilds from scratch, but:
- The HuggingFace cache (`wan-models` volume) is persisted, so model re-downloads are skipped.
- Image build still takes ~5–10 minutes (system deps, ComfyUI, custom nodes).
- Total redeploy time: **~2–5 minutes** for the build, plus volume mount overhead.

## Dev Mode (Ephemeral Tunnel)

For iterative development without creating a permanent deployment, use Modal's `serve` command:

```bash
modal serve comfyapp.py
```

<!-- VERIFY: `modal serve` creates a temporary tunnel with a Modal-generated URL. The URL changes each time you re-run the command. This is useful for testing changes before deploying. -->

This runs the app as an ephemeral tunnel. The URL is printed to stdout and changes each time you re-run `modal serve`. Press **Ctrl+C** to shut it down.

## Common Setup Issues

### Missing HF_TOKEN causes silent model download failures

**Symptom:** The web UI starts but models are missing. ComfyUI shows errors about missing checkpoint files or model loading failures.

**Cause:** The `huggingface` Modal secret does not exist or `HF_TOKEN` is not set inside it. The `_link()` helper in `comfyapp.py` catches exceptions from `hf_hub_download` and prints `FAIL: {filename} (error)` instead of hard-failing, so the build/deploy succeeds even when model downloads fail.

**Fix:** Recreate the secret:
```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```
Then redeploy.

### First deploy takes 30+ minutes

**Symptom:** `modal deploy comfyapp.py` hangs or takes a very long time.

**Cause:** The first deploy downloads ~30+ model files (15+ GB total) and builds a large container image with system dependencies, ComfyUI, and 25+ custom nodes.

**Fix:** Be patient — the build is linear. Pre-download models first (`modal run comfyapp.py`) so the deploy step only downloads what's missing. Consider Modal regions geographically close to you for faster download speeds.

### ComfyUI loads but workflows fail with "model not found"

**Symptom:** The ComfyUI interface loads, but when you queue a workflow, you see errors like `Model not found: ...` or missing checkpoint errors.

**Cause:** The `wan-models` volume might be empty or models were not linked properly. Some workflows expect models in specific subdirectory paths (e.g., `diffusion_models/Wan22Animate/`).

**Fix:** Run the pre-download command to force a full download pass:
```bash
modal run comfyapp.py
```
Then redeploy:
```bash
modal deploy comfyapp.py
```

## Next Steps

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Learn about the project structure, components, and how the Modal deployment works.
- **[CONFIGURATION.md](CONFIGURATION.md)** — Configure GPU type, memory, custom nodes, model downloads, and environment variables.
- **[README.md](../README.md)** — Project overview, workflow descriptions, and high-level details.
