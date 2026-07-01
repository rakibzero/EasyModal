---
mapped: 2026-07-01
focus: tech
---

# Integrations

## External Services

### Modal (platform)
The entire app runs on Modal's serverless container platform.

| Integration | How | Source |
|-------------|-----|--------|
| Container deployment | `modal deploy comfyapp.py` → builds image, registers app `wan22-animate-scail2` | [comfyapp.py:417](comfyapp.py#L417) |
| Persistent volume | `modal.Volume.from_name("wan-models", create_if_missing=True)`, mounted at `/cache` | [comfyapp.py:30](comfyapp.py#L30) |
| Secret | `modal.Secret.from_name("huggingface")` → injects `HF_TOKEN` env var | [comfyapp.py:426](comfyapp.py#L426), [comfyapp.py:442](comfyapp.py#L442) |
| Web endpoint | `@modal.web_server(8188)` → Modal exposes public HTTPS URL | [comfyapp.py:446](comfyapp.py#L446) |
| Concurrency control | `@modal.concurrent(max_inputs=50)` | [comfyapp.py:445](comfyapp.py#L445) |

**CLI auth** (local, in [`.env`](.env) — NOT consumed by the app): `modal token set --token-id ... --token-secret ...`. The app itself never reads these; they authenticate the local `modal` CLI for deploy/run.

### HuggingFace Hub
The primary external data dependency — all model weights are fetched at runtime.

| Aspect | Detail |
|--------|--------|
| Client | `huggingface_hub.hf_hub_download` ([comfyapp.py:38](comfyapp.py#L38)) |
| Auth | `HF_TOKEN` env var → mirrored to `HUGGINGFACE_HUB_TOKEN` ([comfyapp.py:40-42](comfyapp.py#L40-L42)) |
| Cache dir | `/cache` (the Modal Volume) |

**HuggingFace repos depended upon** (single points of failure — if any repo is moved/deleted/gated, downloads silently fail):

| Repo | What |
|------|------|
| `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` | Wan2.2 I2V diffusion, text encoders, VAEs |
| `Comfy-Org/Wan_2.1_ComfyUI_repackaged` | CLIP vision (Wan2.1) |
| `Comfy-Org/SCAIL-2` | SCAIL-2 diffusion + DPO LoRA |
| `Kijai/WanVideo_comfy` | WanVideo encoders, Lightx2v LoRAs, Uni3C ControlNet, relight LoRAs, NLF, VAE |
| `Kijai/WanVideo_comfy_fp8_scaled` | Wan2.2-Animate 14B (fp8 e4m3fn + e5m2) |
| `realrebelai/SCAIL-2_GGUF` | SCAIL-2 quantized (Q5/Q6/Q8) |
| `f5aiteam/ComfyUI` | CLIP-ViT-H |
| `lllyasviel/misc` | clip_vision_vit_h |
| `Kijai/sam2-safetensors` | SAM2.1 hiera large |
| `Comfy-Org/sam3.1` | SAM3.1 multiplex |
| `JoMun/vitpose-l-wholebody` | VitPose ONNX |
| `onnx-community/yolov10m` | YOLOv10 ONNX |

### GitHub (build-time)
~25 ComfyUI custom-node repos are `git clone`d during image build ([comfyapp.py:238-395](comfyapp.py#L238-L395)). These are **pinned to `main`/`master`** (no commit SHAs), so a breaking upstream change breaks the image build. Full list in [ARCHITECTURE.md](ARCHITECTURE.md).

## ComfyUI (internal service)
- ComfyUI is launched as a subprocess via `subprocess.Popen([python, main.py, --listen 0.0.0.0, --port 8188])` ([comfyapp.py:451-455](comfyapp.py#L451-L455))
- Not imported as a library — it's a separate process the web server wraps.
- Communicates with Modal only via the port-8188 binding that `@modal.web_server` exposes.

## No Database / No Auth Provider
- No database. State is model files on a Volume + generated videos in `output/`.
- No user auth — the deployed ComfyUI web endpoint is **public** (protected only by Modal's URL obscurity). See [CONCERNS.md](CONCERNS.md).

## Webhooks
None.

## Filesystem Integrations
| Path | Role |
|------|------|
| `/cache` (Modal Volume) | HF cache + model files + output dir |
| `/root/comfy/ComfyUI/models` | symlink → `/cache/models` ([comfyapp.py:177-192](comfyapp.py#L177-L192)) |
| `/root/comfy/ComfyUI/output` | symlink → `/cache/output` ([comfyapp.py:194-207](comfyapp.py#L194-L207)) |
| `workflows/` (local, in image) | ComfyUI JSON workflows — baked into image, NOT mounted |
