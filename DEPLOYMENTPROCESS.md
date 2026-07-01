<!-- generated-by: gsd-doc-writer -->
# Deployment Process

This document describes the full deployment lifecycle of the Wan2.2Animate Modal + ComfyUI application.

## Overview

The application runs as a serverless [Modal](https://modal.com) app named `wan22-animate-scail2`. Deployment consists of a single Python file (`comfyapp.py`) that defines a container image, a persistent volume for model caching, and a web server function that serves ComfyUI on port 8188.

---

## 1. Prerequisites

Before your first deployment, ensure the following are in place:

| Requirement | Details |
|-------------|---------|
| **Modal account** | Sign up at [modal.com](https://modal.com). Free tier includes $30/month compute credit. |
| **HuggingFace account** | Required to download gated model repos. Generate a read token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). |
| **Modal CLI** | Install and authenticate: |

```bash
pip install modal
modal setup
```

The `modal setup` command opens a browser to authenticate your CLI with your Modal account. Alternatively, set credentials programmatically:

```bash
modal token set --token-id <YOUR_TOKEN_ID> --token-secret <YOUR_TOKEN_SECRET>
```

<!-- VERIFY: Token ID and Token Secret values must be obtained from https://modal.com/settings/tokens. They are unique per user and are not included in the repository. -->

---

## 2. HuggingFace Secret

The `HF_TOKEN` is required for model downloads from HuggingFace Hub. Create a Modal secret **before** deploying:

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

This creates a secret named `huggingface` that is referenced in both Modal functions via `modal.Secret.from_name("huggingface")`. Without this secret, model downloads will fail silently — the `_link()` helper catches exceptions from `hf_hub_download` and prints a `FAIL` message for each model.

---

## 3. First-Time Deploy

The primary deployment command is:

```bash
modal deploy comfyapp.py
```

### What happens during deployment

The process has three main phases:

#### Phase A — Image Build (~15–30 minutes on first run)

Modal builds a container image using the definition in `comfyapp.py:171-371`. The layers are:

1. **Base image**: `debian-slim` with Python 3.11
2. **System packages**: `git`, `wget`, `ffmpeg`, `libgl1`, `libglib2.0-0`, `libsm6`, `libxext6`, `libxrender-dev`, `libfontconfig`
3. **Core Python**: `fastapi[standard]==0.115.4`, `comfy-cli==1.5.3`, `boto3`, `huggingface-hub>=0.26.0`
4. **ComfyUI installation**: `comfy --skip-prompt install --fast-deps --nvidia --skip-manager` (installs latest master/nightly to `/root/comfy/ComfyUI/`)
5. **SageAttention**: Optional CUDA kernel library (`pip install sageattention 2>/dev/null || true`)
6. **30 custom node repositories**: Each cloned via `git clone` into `/root/comfy/ComfyUI/custom_nodes/`, followed by `pip install -r requirements.txt` where applicable. Includes:
   - VideoHelperSuite, WanVideoWrapper, KJNodes, Custom Scripts, rgthree-comfy, Essentials, WAS Node Suite, cg-use-everywhere, Frame Interpolation, RMBG, Inpaint CropAndStitch, fofr-toolkit, Efficiency Nodes, KayTool, WanAnimatePlus, WanAnimatePreprocess, SCAIL-Pose, comfyui-scail2, SDPose-OOD, Swwan, Segment Anything 2, GGUF loader, Impact Pack, ComfyUI-Manager, civitai-comfy-nodes
7. **Additional Python deps**: `numpy`, `transformers>=4.40.0`, `flash-attn`, `ninja`, `packaging`, `safetensors`, `onnxruntime-gpu`, `opencv-python-headless`, `scipy`, `einops`, `accelerate`, `imageio`, `imageio-ffmpeg`

#### Phase B — Volume Setup

Modal creates (or reuses) a persistent [Volume](https://modal.com/docs/guide/volumes) named `wan-models`, mounted at `/cache` inside the container. This volume stores the HuggingFace Hub download cache and survives across deployments.

#### Phase C — Model Download

The `ui()` function calls `download_models()` (defined at `comfyapp.py:35-164`) which:

- Creates model subdirectories: `diffusion_models`, `text_encoders`, `vae`, `clip_vision`, `loras`, `sam`, `onnx`, `nlf`
- Downloads each model from HuggingFace Hub via `hf_hub_download` into the `/cache` volume
- Creates symlinks from the volume cache into `/root/comfy/ComfyUI/models/<subdir>/`
- Creates convenience subdirectory symlinks: `diffusion_models/Wan22Animate/` and `diffusion_models/Wan22Bernini/`

Models downloaded include:
- Wan 2.2 I2V diffusion models (high noise + low noise, fp8)
- Text encoders (UMT5 fp8, UMT5 bf16)
- VAEs (wan2.1, wan2.2)
- CLIP vision encoder
- Lightx2v LoRAs (rank 64, rank 128)
- SCAIL-2 diffusion models (fp8, fp16)
- SCAIL-2 DPO LoRA
- SCAIL-2 GGUF (Q5_K_M, Q6_K, Q8_0)
- WanAnimate+ diffusion models (fp8)
- Bernini diffusion models (HIGH, LOW fp8)
- WanAnimate relight LoRAs
- Wan2.2-Animate v2
- SAM models (SAM3.1 multiplex, SAM2.1)
- ONNX pose/detection models (VitPose, YOLOv10m)
- NLF model

#### Phase D — Web Server Start

After models are downloaded, Modal starts the ComfyUI web server:

```python
subprocess.run("comfy launch -- --listen 0.0.0.0 --port 8188", shell=True, check=True)
```

The `@modal.web_server(8188, startup_timeout=600)` decorator tells Modal to wait up to 600 seconds (10 minutes) for the server to bind to port 8188 before considering the deployment successful.

---

## 4. Accessing the Server

After `modal deploy comfyapp.py` completes successfully, Modal outputs a public HTTPS URL. The URL follows the pattern:

```
https://<user>--wan22-animate-scail2-ui.modal.run
```

<!-- VERIFY: The exact subdomain depends on the Modal username and app name. The pattern is `https://<username>--<appname>-<functionname>.modal.run`. -->

Open this URL in a browser to access the ComfyUI web interface. From there you can:

- Load workflow JSON files from the `workflows/` directory
- Queue image/video generation jobs
- Download generated outputs

> **Note**: The first request after a period of inactivity may take ~30 seconds (cold start) while Modal spins up a new container and re-initializes the environment. Subsequent requests on a warm container are fast.

---

## 5. Redeploying

Redeploying is the same command:

```bash
modal deploy comfyapp.py
```

### Why redeploys are faster

- **Image caching**: Modal caches each build layer. If `comfyapp.py` hasn't changed, the image is reused instantly. If only the last layer changed (e.g., a custom node was added), only that layer is rebuilt.
- **Volume persistence**: The `wan-models` volume retains all previously downloaded models. The `_link()` helper checks if each file/symlink already exists and skips the download, printing `EXISTS: {name}`.
- **Model skipping**: Only new or missing models are downloaded on redeploy.

Typical redeploy time: **30 seconds to 5 minutes** (depending on whether the image needs rebuilding).

---

## 6. Dev Tunnel (Ephemeral)

For testing changes before committing to a full deploy, use Modal's `serve` command:

```bash
modal serve comfyapp.py
```

This creates a temporary, ephemeral deployment:

- Provides a Modal URL (same pattern as deploy)
- Supports hot-reloading — code changes while `modal serve` is running will trigger an automatic container restart
- **Stops when you press Ctrl+C** — no persistent deployment remains
- Does not preserve the deployment state in the Modal dashboard
- Useful for rapid iteration on custom nodes, workflows, or model changes

The dev tunnel includes the same `@web_server` behavior — it exposes ComfyUI on port 8188.

---

## 7. Pre-Download Models Only

To download and cache all models **without** starting a web server:

```bash
modal run comfyapp.py
```

This runs the `main()` local entrypoint which calls:

```python
download_all_models.remote()
```

The `download_all_models` function (`comfyapp.py:384-389`) runs on a CPU-only Modal worker (no GPU, no web server) with:

- No `gpu` parameter (defaults to CPU)
- No `memory` or `cpu` overrides (Modal defaults)
- `timeout=3600` (60 minutes) for large model downloads
- `volumes={"/cache": vol}` for persisting to the `wan-models` volume
- `secrets=[modal.Secret.from_name("huggingface")]` for HuggingFace authentication

Use this command to:

- Pre-cache models before a deploy to avoid the download wait during startup
- Update cached model files without redeploying
- Validate that all model URLs and repos are accessible

---

## 8. Inspecting the Volume

To check which models are currently cached in the `wan-models` volume:

```bash
modal volume ls wan-models
```

This lists the top-level contents of the HuggingFace Hub cache directory. To explore specific model files:

```bash
modal volume ls wan-models models--Comfy-Org--Wan_2.2_ComfyUI_Repackaged
```

Useful commands:

| Command | Purpose |
|---------|---------|
| `modal volume ls wan-models` | List top-level cached repos |
| `modal volume ls wan-models <path>` | List contents of a specific repo cache |
| `modal volume get wan-models <remote_path> <local_path>` | Download a file from volume |
| `modal volume put wan-models <local_path> <remote_path>` | Upload a file to volume |
| `modal volume delete wan-models` | **Danger**: Delete the entire volume (all cached models lost — must re-download) |

> **Warning**: Deleting the `wan-models` volume will force a full re-download of all ~40+ model files on the next deploy. Only delete if you need to reclaim storage or fix a corrupted cache.

---

## 9. Secrets Management

### Required secrets

| Secret Name | Key | Purpose |
|-------------|-----|---------|
| `huggingface` | `HF_TOKEN` | Authenticates model downloads from HuggingFace Hub |

### How to create

```bash
modal secret create huggingface HF_TOKEN=hf_your_token_here
```

### How to update

```bash
modal secret create huggingface HF_TOKEN=hf_new_token_here
```

This overwrites the existing secret. All running containers continue with the old value; newly started containers use the new value.

### How to list

```bash
modal secret list
```

### How to delete

```bash
modal secret delete huggingface
```

> **Note**: Deleting the `huggingface` secret will cause the `download_models()` function to run without `HF_TOKEN`. Gated model downloads will fail. Create a new secret before the next deploy.

---

## 10. GPU and Resource Allocation

| Function | GPU | Memory | vCPUs | Timeout |
|----------|-----|--------|-------|---------|
| `download_all_models` | None (CPU only) | Modal default | Modal default | 3600s (60 min) |
| `ui` (ComfyUI web server) | `A100-80GB` (80 GB VRAM) | 32768 MB (32 GB) | 8.0 | 1800s (30 min) |

<!-- VERIFY: The A100-80GB GPU is hard-coded in comfyapp.py line 398. Availability and exact performance depend on Modal's current inventory and the user's account tier. -->

The web server is configured with:

```python
@modal.concurrent(max_inputs=5)
```

This allows up to 5 ComfyUI inference requests to run simultaneously on the same GPU container. Modal queues additional requests beyond that limit.

---

## 11. Idle Timeout and Cold Start

| Setting | Value | Notes |
|---------|-------|-------|
| Container idle timeout | 300 seconds (5 minutes) | Modal platform default — not configured in `comfyapp.py` |

<!-- VERIFY: The 300-second idle timeout is Modal's default behavior. It is not explicitly set in the source code and can be configured in the Modal dashboard or via the SDK. -->

### Behavior

1. After 300 seconds of inactivity, Modal spins down the container (scale-to-zero).
2. The next HTTP request triggers a new container to start.
3. Cold start time: **~30 seconds** (container boot + Python import + ComfyUI launch).
4. Warm requests (to an already-running container): near-instant.

### Mitigating cold starts

- Send periodic keep-alive requests (e.g., a cron job pinging the health endpoint)
- Use Modal's `min_containers` parameter in a `@app.function(...)` decorator to keep at least one container warm (requires a server-class function, not currently configured)
- Consider `@modal.server()` with `keep_warm=1` for dedicated availability

---

## 12. Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| `no huggingface secret` error | `HF_TOKEN` modal secret doesn't exist | Run `modal secret create huggingface HF_TOKEN=hf_...` |
| Model download shows `FAIL: ...  (403 Client Error)` | `HF_TOKEN` is invalid or expired | Regenerate your HuggingFace token and update the secret: `modal secret create huggingface HF_TOKEN=hf_new_token` |
| `CUDA out of memory` during inference | Workflow complexity exceeds GPU VRAM | Reduce batch size, use a lower-resolution workflow, or switch to quantized (GGUF/fp8) model variants |
| `Missing model` error in ComfyUI | A model symlink wasn't created | Check if the model was downloaded: `modal volume ls wan-models`. Manually run `modal run comfyapp.py` to trigger download. |
| Deployment takes >30 minutes | First-time image build or all models need downloading | Subsequent deploys are much faster. Use `modal run comfyapp.py` to pre-download models before deploying. |
| Web server doesn't start / times out | Container couldn't bind to port 8188 within 600 seconds | Check the Modal logs: `modal logs wan22-animate-scail2`. May indicate a ComfyUI launch failure or model download timeout. |
| `modal deploy` fails with auth error | Modal CLI not authenticated or token expired | Run `modal setup` again or check your tokens at https://modal.com/settings/tokens |
| Volume disk space full | Too many cached model versions | Consider recreating the volume: `modal volume rm wan-models <old-cache>` for selective cleanup |
| `os.symlink` error during download | Volume mount issue | Ensure the volume is mounted at `/cache`. Verify with `modal volume ls wan-models`. |

### Checking logs

```bash
# View recent logs
modal logs wan22-animate-scail2

# Stream logs in real-time
modal logs wan22-animate-scail2 --follow
```

### Debug shell

If a container is running, you can shell into it:

```bash
modal container list
modal shell <container-id>
```

---

## 13. CI/CD Integration

To automate deployments (e.g., from GitHub Actions), use Modal's token authentication:

1. Generate a token pair at https://modal.com/settings/tokens
2. Add `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` to your GitHub repository secrets
3. Create a workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to Modal

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
      MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install modal
      - run: modal deploy comfyapp.py
```

<!-- VERIFY: The GitHub Actions workflow above is a template. The exact trigger branch and secrets names depend on the repository configuration. -->

---

## 14. Undeploy / Teardown

To stop the deployment and release resources:

```bash
modal app stop wan22-animate-scail2
```

This stops all running containers but preserves the volume and image cache. To fully delete everything:

```bash
modal app stop wan22-animate-scail2    # Stop the app
modal volume delete wan-models          # Delete cached models (optional)
```

> **Warning**: `modal volume delete wan-models` is destructive and irreversible. The volume must be recreated and all models re-downloaded on the next deploy.

---

## 15. Summary of Commands

| Command | Purpose |
|---------|---------|
| `pip install modal` | Install Modal CLI |
| `modal setup` | Authenticate CLI with Modal account |
| `modal secret create huggingface HF_TOKEN=hf_...` | Create the required HuggingFace secret |
| `modal run comfyapp.py` | Pre-download all models (no web server) |
| `modal deploy comfyapp.py` | Deploy persistent ComfyUI web server |
| `modal serve comfyapp.py` | Ephemeral dev tunnel (hot-reload) |
| `modal volume ls wan-models` | Inspect cached model files |
| `modal logs wan22-animate-scail2` | View deployment logs |
| `modal app stop wan22-animate-scail2` | Stop the deployment |
