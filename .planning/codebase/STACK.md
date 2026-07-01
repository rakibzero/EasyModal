---
mapped: 2026-07-01
focus: tech
---

# Stack

## Languages & Runtime

| Item | Value |
|------|-------|
| Primary language | Python 3.11 |
| Runtime | Modal serverless containers (Debian slim) |
| Execution model | `@modal.web_server` (ComfyUI process) + `@app.function` (model download) |
| Local entrypoint | `@app.local_entrypoint` (CLI: `modal run` / `modal deploy`) |

The entire application is a **single Python file**: [comfyapp.py](comfyapp.py) (468 lines). No separate build system, no `requirements.txt`, no `pyproject.toml` — all dependencies are declared inline as Modal image layers.

## Frameworks & Core Libraries

### Modal SDK
- `modal` — the deployment platform SDK. Defines `modal.App`, `modal.Image`, `modal.Volume`, `modal.Secret`, function decorators.
- App name: `wan22-animate-scail2` ([comfyapp.py:417](comfyapp.py#L417))

### ComfyUI ecosystem (installed at image build)
- **`comfy-cli==1.5.3`** — installs ComfyUI nightly (latest master) with `--fast-deps --nvidia --skip-manager` ([comfyapp.py:232](comfyapp.py#L232))
- **`fastapi[standard]==0.115.4`** — pinned; ComfyUI's API server backend
- **`huggingface-hub>=0.26.0`** — model downloads via `hf_hub_download`
- **`boto3`** — present (likely for future S3/model storage; not actively used in current code)

### Python runtime packages ([comfyapp.py:397-410](comfyapp.py#L397-L410))
- `numpy`, `transformers>=4.40.0`, `ninja`, `packaging`, `safetensors`
- `onnxruntime-gpu` — for VitPose / YOLO ONNX models
- `opencv-python-headless`, `scipy`, `einops`, `accelerate`
- `imageio`, `imageio-ffmpeg` — video I/O
- `sageattention` — installed optionally (`|| true`), ignored if build fails ([comfyapp.py:235](comfyapp.py#L235))

> **Note:** [docs/CONFIGURATION.md](docs/CONFIGURATION.md) lists `flash-attn` in the Python deps, but the **actual code does not install it**. Doc drift — verify before relying on it.

## System Packages (apt) ([comfyapp.py:217-222](comfyapp.py#L217-L222))
`git`, `wget`, `ffmpeg`, `libgl1`, `libglib2.0-0`, `libsm6`, `libxext6`, `libxrender-dev`, `libfontconfig`

These are the minimal set needed by ComfyUI + OpenCV + ffmpeg video processing.

## Package Manager
- **`uv`** (via `modal.Image.uv_pip_install`) for Python packages
- **`pip`** inside `.run_commands(...)` for custom-node `requirements.txt` files
- **`apt`** for system packages

## Hardware Configuration

| Function | GPU | Memory | CPU | Timeout | Source |
|----------|-----|--------|-----|---------|--------|
| `download_all_models` | none (CPU) | default | default | 3600s | [comfyapp.py:424-428](comfyapp.py#L424-L428) |
| `ui` (web server) | `A100-80GB` | 32768 MB | 8.0 vCPU | 1800s | [comfyapp.py:437-446](comfyapp.py#L437-L446) |

- `@modal.concurrent(max_inputs=50)` — allows up to 50 concurrent inputs on one container ([comfyapp.py:445](comfyapp.py#L445))
- `@modal.web_server(8188, startup_timeout=1800)` — ComfyUI on port 8188 ([comfyapp.py:446](comfyapp.py#L446))

> **Note:** [docs/CONFIGURATION.md](docs/CONFIGURATION.md) reports `max_inputs=5` and `startup_timeout=600`, but the **actual code says 50 and 1800**. Doc drift. [setups.txt](setups.txt) sketches alternative setups (L4, L40S-48GB, A100-80GB) but only A100-80GB is hard-coded.

## Configuration Approach
- **No config files.** All config lives inline in `comfyapp.py`.
- Secrets via Modal: `modal.Secret.from_name("huggingface")` providing `HF_TOKEN`.
- No `.env`-driven runtime config (`.env` is local-only and contains CLI tokens, not consumed by the app).
- No per-environment overrides — environment isolation is by Modal workspace / app name.

## Versions Summary (pinned)
| Package | Version |
|---------|---------|
| Python | 3.11 |
| comfy-cli | 1.5.3 |
| fastapi[standard] | 0.115.4 |
| huggingface-hub | ≥0.26.0 |
| transformers | ≥4.40.0 |

Everything else is unpinned (latest at build time), which is a reproducibility risk — see [CONCERNS.md](CONCERNS.md).
