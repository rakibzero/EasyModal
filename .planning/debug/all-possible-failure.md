---
status: resolved
trigger: "ALL POSSIBLE FAILURE — comprehensive pre-deployment audit"
created: 2026-06-24
updated: 2026-06-25
resolution: Deployed successfully. ComfyUI v0.26.0 with 2,172 nodes, 28 models cached on volume.
---

# Wan2.2Animate — Final Deployment Documentation

## Quick Reference

```
# Pre-download models to volume
modal run comfyapp.py

# Deploy web server
modal deploy comfyapp.py

# URL
https://myai--wan22-animate-scail2-ui.modal.run

# Stop
modal app stop wan22-animate-scail2 --yes
```

---

## Architecture

```
Modal Container (A100-80GB, 32GB RAM, 8 vCPU)
│
├── /cache/ (volume: wan-models, persisted across deploys)
│   ├── models/
│   │   ├── checkpoints/       — sam3.1_multiplex_fp16.safetensors
│   │   ├── diffusion_models/   — Wan2.2 I2V, SCAIL-2, WanAnimate, GGUF (~170 GB)
│   │   ├── text_encoders/      — umt5 fp8 + bf16
│   │   ├── vae/                — Wan 2.1, 2.2, 2.1 bf16
│   │   ├── clip_vision/        — clip_vision_h, ViT-H, vit_h
│   │   ├── loras/              — Lightx2v, relight, SCAIL DPO
│   │   ├── controlnet/         — Uni3C fp16
│   │   ├── sam/                — sam2.1_hiera_large
│   │   ├── detection/          — vitpose, yolov10m
│   │   ├── nlf/                — nlf_l_multi
│   │   ├── configs/, embeddings/, upscale_models/ — empty (ComfyUI expects these)
│   └── output/  ← symlinked from /root/comfy/ComfyUI/output
│
├── /root/comfy/ComfyUI/
│   ├── models/ → /cache/models/ (symlink, created at runtime)
│   ├── output/ → /cache/output/ (symlink, created at runtime)
│   ├── main.py ← started via subprocess.Popen
│   └── custom_nodes/ (30+ repos)
```

### Model Inventory (28 models, ~180 GB total)

| Category | Count | Size |
|----------|-------|------|
| diffusion_models | 8 | ~145 GB |
| text_encoders | 2 | ~18 GB |
| vae | 3 | ~2 GB |
| clip_vision | 3 | ~6 GB |
| loras | 5 | ~6 GB |
| controlnet | 1 | ~2 GB |
| checkpoints | 1 | ~2 GB |
| sam | 1 | ~1 GB |
| detection | 2 | ~1 GB |
| nlf | 1 | ~0.4 GB |
| GGUF | 3 | ~44 GB |

---

## Key Configuration

```python
# Volume
vol = modal.Volume.from_name("wan-models", create_if_missing=True)
CACHE_DIR = "/cache"
VOL_MODELS = f"{CACHE_DIR}/models"

# Web endpoint
@app.function(
    gpu="A100-80GB",
    memory=32768,
    cpu=8.0,
    volumes={CACHE_DIR: vol},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=1800,
)
@modal.concurrent(max_inputs=50)
@modal.web_server(8188, startup_timeout=1800)
def ui():
    download_models()
    ensure_comfy_models_symlink()
    import sys, subprocess
    subprocess.Popen(
        [sys.executable, f"{COMFY_DIR}/ComfyUI/main.py",
         "--listen", "0.0.0.0", "--port", "8188"],
        cwd=f"{COMFY_DIR}/ComfyUI",
    )
```

### Why `subprocess.Popen` not `subprocess.run`
`Popen` returns immediately after starting the server. The container stays alive as long as port 8188 is listening. `subprocess.run` would block forever, which also works but is less clean.

### Why `model_dir.symlink_to(vol_models)` not direct download
Symlinks from ComfyUI models dir to volume models dir persist across restarts. Direct downloads to `/root/comfy/ComfyUI/models/` would be lost on container stop.

### Why symlink uses `shutil.rmtree` first
ComfyUI install creates `/root/comfy/ComfyUI/models/` as a real directory during image build. We must delete it before creating the symlink to the volume.

### Why `@modal.concurrent(max_inputs=50)`
Without it, every browser sub-request (CSS, JS, WebSocket, API) spawns a new A100 container. 50 concurrent inputs means one container handles all browser requests.

---

## Issues Fixed (chronological)

### 1. Deprecation Error
`allow_concurrent_inputs` deprecated → replaced with `@modal.concurrent`

### 2. Image Build Failures
- `ComfyUI-segment-anything-2`: no `requirements.txt` — removed pip install step
- `flash-attn`: can't compile without CUDA during build — removed from deps

### 3. Model 404s (15+ models)
| Issue | Fix |
|-------|-----|
| `clip_vision_h` in wrong repo (Wan2.2 vs Wan2.1) | Changed to `Comfy-Org/Wan_2.1_ComfyUI_repackaged` |
| `rank128` Lightx2v in wrong repo | Moved to `Kijai/WanVideo_comfy/Lightx2v/` |
| 2x non-existent Wan2.1 Lightx2v rank64 variants | Removed (rank64_bf16 from Kijai covers the use case) |
| `WanAnimate/` subdir doesn't exist in `Kijai/WanVideo_comfy` | Changed to `Kijai/WanVideo_comfy_fp8_scaled/Wan22Animate/` |
| Bernini models don't exist anywhere reliable | Removed |
| `Comfy-Org/Wan2.2-Animate_ComfyUI` repo doesn't exist | Removed, model from fp8_scaled repo |
| `sam3.1_multiplex` in wrong location | Fixed repo to `Comfy-Org/sam3.1`, moved to `checkpoints/` |
| `sam2.1_hiera_large` wrong repo | Fixed to `Kijai/sam2-safetensors` |
| `vitpose-l-wholebody.onnx` wrong repo | Fixed to `JoMun/vitpose-l-wholebody`, moved to `detection/` |
| `yolov10m.onnx` wrong repo | Fixed to `onnx-community/yolov10m`, moved to `detection/` |
| `Wan2_1_VAE_bf16` wrong path | Fixed to root level of `Kijai/WanVideo_comfy` |
| 2x clip_vision models missing | Added `CLIP-ViT-H-14-laion2B-s32B-b79K` and `clip_vision_vit_h` |
| Lightx2v T2V rank256 missing | Added from `Kijai/WanVideo_comfy/Lightx2v/` |
| Uni3C ControlNet missing | Added from `Kijai/WanVideo_comfy` root |

### 4. Volume Persistence (symlink → copy)
`os.symlink()` from non-volume path to volume path → symlinks lost on restart.
Fixed: Models stored directly on volume at `/cache/models/`, then symlink entire models dir at runtime.

### 5. Model Storage on Volume (hard link → copy fallback)
`os.link()` fails on Modal network volumes (`PermissionError: Operation not permitted`).
Fixed: `os.link()` first, fallback to `shutil.copy2()`.

### 6. Web Endpoint Not Responding (3 issues)
- **`subprocess.run` vs `Popen`**: `Popen` + immediate return is the correct Modal pattern
- **Symlink not created**: `ensure_comfy_models_symlink()` had wrong condition — fixed with `shutil.rmtree` before symlink
- **Container DDoS**: Missing `@modal.concurrent(max_inputs=50)` caused browser sub-requests to spawn 10+ containers

### 7. sam3.1 Wrong Directory
SCAIL-2 CheckpointLoaderSimple expects sam3.1 in `checkpoints/`, not `sam/`. Fixed.

---

## Mistakes & Lessons

| Mistake | Consequence | Lesson |
|---------|-------------|--------|
| Removing `@modal.concurrent` entirely | 10 A100 containers spawned per browser load ($15+/hr) | Always set `@modal.concurrent` for web endpoints |
| Using symlinks on non-volume path | Models re-downloaded every cold start → timeout loop | Always verify persistence on second run |
| Multiple curl tests during cold start | 11 pending + 6 cold-starting containers | Test with ONE request, wait, then verify |
| Changing 5 things at once | 15+ deploys, unable to isolate working fix | One change → deploy → test → next change |
| Not reading Modal docs first | Tried ASGI proxy, threading.Event, etc. unnecessarily | Read the simple pattern: Popen + return + web_server |
| Hard-coded API token in source | Token exposed in code comment | Never put secrets in source files |
| Not pre-downloading before deploy | Cold start takes ~2 min | `modal run` first to populate volume |
| Wrong model directory in ComfyUI | sam3.1 in `sam/` instead of `checkpoints/` | Check which ComfyUI loader expects which folder |

---

## Pre-Deploy Checklist

```
[ ] modal run comfyapp.py             # Pre-populate volume
[ ] Verify: ZERO "FAIL:" lines
[ ] modal deploy comfyapp.py          # Deploy
[ ] Open URL ONCE in browser          # Wait 2 min for cold start
[ ] modal app list | grep Tasks        # Should show 1, never >1
[ ] Check ComfyUI loads workflows
[ ] Do NOT curl/ping during startup
```

---

## Files

| File | Purpose |
|------|---------|
| `comfyapp.py` | Modal app: image build, model downloads, web endpoint |
| `workflows/*.json` | 10 ComfyUI workflow files |
| `DEPLOYMENTPROCESS.md` | Deployment guide |
| `README.md` | Project overview |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/CONFIGURATION.md` | Configuration reference |
| `docs/GETTING-STARTED.md` | Quick start guide |
| `docs/DEVELOPMENT.md` | Developer guide |
| `docs/TESTING.md` | Testing procedures |
