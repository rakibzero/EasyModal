# Deploying ComfyUI on Modal.com

## What is Modal.com?

Modal is a serverless GPU infrastructure platform. Pay per-second for GPU usage, scale to zero when idle, define everything in Python (no YAML/Kubernetes).

**Available GPUs:** L40S (48GB), A100 (40/80GB), H100, A10G, and more.

## Two Main Approaches

### 1. Quick UI Deployment — [NNikoGG/modal-comfyui-setup](https://github.com/NNikoGG/modal-comfyui-setup)

Single-file deployment that spins up a full ComfyUI web interface on Modal. Pre-loaded with Wan 2.2 I2V, Qwen Image Edit, and curated custom nodes.

**Key file** (`comfyapp.py`):
```python
import modal
vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "wget", "ffmpeg", "libgl1", "libglib2.0-0")
    .uv_pip_install("fastapi[standard]==0.115.4", "comfy-cli==1.5.3", "boto3")
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia")
    .run_commands(
        # clone custom nodes, install deps
    )
    .run_function(download_models, volumes={"/cache": vol})
)

@app.function(gpu="L40S", volumes={"/cache": vol})
@modal.concurrent(max_inputs=10)
@modal.web_server(8000, startup_timeout=60)
def ui():
    subprocess.run("comfy launch -- --listen 0.0.0.0 --port 8000", shell=True)
```

### 2. API-First Deployment — [tolgaouz/modal-comfy-worker](https://github.com/tolgaouz/modal-comfy-worker)

For programmatic access with REST endpoints:
- `POST /infer_sync` — Run workflow and wait for result
- `POST /infer_async` — Queue workflow, get job ID
- `GET /check_status/{job_id}` — Check job status
- `POST /cancel/{job_id}` — Cancel running job

**Three config files:**
- `prompt.json` — Your exported ComfyUI workflow (API format, ends with `SaveImageWebSocket` node)
- `snapshot.json` — Custom nodes manifest (Git repos + commit hashes)
- `workflow.py` — Entrypoint; maps API params to workflow nodes
- `prompt_constructor.py` — Transforms API requests into ComfyUI prompt JSON

## Quick Setup

```bash
# 1. Install Modal CLI
pip install modal && modal setup

# 2. For UI approach:
git clone https://github.com/NNikoGG/modal-comfyui-setup.git
cd modal-comfyui-setup
modal deploy comfyapp.py   # first deploy takes 15-30 min

# 3. For API approach:
git clone https://github.com/tolgaouz/modal-comfy-worker.git
cd modal-comfy-worker
# Export workflow as API JSON → prompt.json
# Configure snapshot.json with custom nodes
uv run modal deploy workflow
```

## Key Architecture Patterns

| Pattern | Purpose |
|---------|---------|
| `modal.Volume` | Persist model weights across deploys (no re-download) |
| Symlinks (`ln -s`) | Keep container image lean; symlink volume → ComfyUI model dirs |
| `@web_server` | Expose ComfyUI's built-in HTTP server through Modal |
| Memory snapshotting | Sub-3s cold starts by saving initialized container state |
| `@concurrent()` | Allow multiple requests per container without spawning new ones |
| Modal Secrets | Store API tokens (Civitai, GitHub) securely |

## Cold Start Optimization

Tolga Oğuz achieved sub-3s cold starts (from ~15s baseline) using Modal's memory snapshotting:

1. Create a custom `ExperimentalComfyServer` class
2. During snapshot phase, trick PyTorch into thinking no GPU is available:
   ```python
   torch.cuda.is_available = lambda: False
   ```
3. After snapshot is created, restore CUDA access
4. Only works with CPU memory snapshots (not GPU)

## Model Management

Models are stored in a persistent `modal.Volume` mounted at `/cache`:
- Downloaded once via `hf_hub_download` during image build
- Symlinked into ComfyUI's expected model directories
- Survives container restarts and redeploys
- Deleting the volume loses all cached models

## Adding Custom Nodes

```python
.run_commands(
    "cd /root/comfy/ComfyUI/custom_nodes && git clone https://github.com/author/MyCustomNode",
    "cd /root/comfy/ComfyUI/custom_nodes/MyCustomNode && pip install -r requirements.txt",
)
```

## Pricing (Modal, per second)

| GPU | $/hr (approx) |
|-----|--------------|
| A10G | ~$0.74 |
| L40S | ~$1.10 |
| A100-40GB | ~$1.59 |
| A100-80GB | ~$2.19 |
| H100 | ~$3.31 |

$30/month free compute included. Scale-to-zero = pay only when generating.

## Troubleshooting

- **UI doesn't load / times out** — Container may still be starting. Wait 30-60s and refresh.
- **"Symlink already exists" errors** — Deploy was interrupted. Clear symlinks via `modal shell`
- **Models not appearing** — Check volume mount / symlinks resolve correctly
- **Civitai LoRA 401** — Missing or incorrect `CIVITAI_TOKEN` secret
- **Out of VRAM** — Switch to larger GPU (A100 80GB) or use quantized model variant

## References

- [NNikoGG/modal-comfyui-setup](https://github.com/NNikoGG/modal-comfyui-setup) — UI-focused deployment
- [tolgaouz/modal-comfy-worker](https://github.com/tolgaouz/modal-comfy-worker) — API-focused deployment
- [Joel's Blog: Deploying ComfyUI on Modal](https://ajoellee.com/blog/comfyui-with-modal/) — Walkthrough with troubleshooting
- [Tolga's Blog: Cold starts under 3s](https://tolgaoguz.dev/post/comfy-workflow-api-with-modal) — Memory snapshot optimization
- [Modal Docs](https://modal.com/docs/guide) — Official documentation
- [ComfyUI Docs](https://docs.comfy.org/) — Official documentation
