"""
Wan2.2Animate Deploy — clean bundled ComfyUI-on-Modal template.

Refactored from the original comfyapp.py to fix the reliability issues called out
in .planning/codebase/CONCERNS.md:
  1. CONFIG dict at top — all magic values in one place (GPU, max_inputs, timeouts, app name).
  2. Data-driven MODELS list — one table drives both download AND the coverage checker.
  3. Loud failures — download_models() raises if a REQUIRED model fails, instead of
     silently shipping a broken image.
  4. Safe max_inputs default (2, not 50) — a single Wan2.2 inference uses 30-50GB VRAM.

Placeholders (rendered by the deploy pipeline before deploy):
  {{APP_NAME}}        — Modal app name
  {{GPU}}             — GPU type, e.g. A100-80GB
  {{MAX_INPUTS}}      — max concurrent inputs per container
  {{TIMEOUT_SECONDS}} — function timeout
  {{MEMORY_MB}}       — function memory
  {{CPU}}             — function vCPUs
"""

import os
import shutil
import subprocess
from pathlib import Path

import modal

# =============================================================================
# CONFIG (single source of truth)
# =============================================================================
CONFIG = {
    "app_name": "{{APP_NAME}}",
    "gpu": "{{GPU}}",
    "max_inputs": {{MAX_INPUTS}},
    "timeout_seconds": {{TIMEOUT_SECONDS}},
    "memory_mb": {{MEMORY_MB}},
    "cpu": {{CPU}},
}

COMFY_DIR = "/root/comfy"
MODEL_DIR = f"{COMFY_DIR}/ComfyUI/models"
CACHE_DIR = "/cache"
VOL_MODELS = f"{CACHE_DIR}/models"

vol = modal.Volume.from_name("wan-models", create_if_missing=True)

# =============================================================================
# MODELS — data-driven. Each entry: (subdir, repo, filepath, required)
# `required=False` models warn on failure but don't abort the deploy.
# =============================================================================
MODELS = [
    ("diffusion_models", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
     "split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", True),
    ("diffusion_models", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
     "split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", True),
    ("text_encoders", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
     "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", True),
    ("text_encoders", "Kijai/WanVideo_comfy", "umt5-xxl-enc-bf16.safetensors", False),
    ("vae", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan_2.1_vae.safetensors", True),
    ("vae", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan2.2_vae.safetensors", False),
    ("vae", "Kijai/WanVideo_comfy", "Wan2_1_VAE_bf16.safetensors", False),
    ("clip_vision", "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
     "split_files/clip_vision/clip_vision_h.safetensors", True),
    ("clip_vision", "f5aiteam/ComfyUI",
     "clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors", False),
    ("diffusion_models", "Comfy-Org/SCAIL-2",
     "diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors", False),
    ("loras", "Comfy-Org/SCAIL-2", "loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors", False),
    ("diffusion_models", "Kijai/WanVideo_comfy_fp8_scaled",
     "Wan22Animate/Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors", False),
    ("diffusion_models", "Kijai/WanVideo_comfy_fp8_scaled",
     "Wan22Animate/Wan2_2-Animate-14B_fp8_e5m2_scaled_KJ.safetensors", False),
    ("sam", "Kijai/sam2-safetensors", "sam2.1_hiera_large.safetensors", False),
    ("checkpoints", "Comfy-Org/sam3.1", "checkpoints/sam3.1_multiplex_fp16.safetensors", False),
    ("detection", "JoMun/vitpose-l-wholebody", "vitpose-l-wholebody.onnx", False),
    ("detection", "onnx-community/yolov10m", "onnx/model.onnx", False),
    ("nlf", "Kijai/WanVideo_comfy", "SCAIL/nlf_l_multi_0.3.2_fp16.safetensors", False),
    ("loras", "Kijai/WanVideo_comfy",
     "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors", False),
    ("loras", "Kijai/WanVideo_comfy",
     "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", False),
]

MODEL_SUBDIRS = sorted({m[0] for m in MODELS} | {
    "text_encoders", "vae", "clip_vision", "loras", "sam", "detection", "nlf",
    "controlnet", "checkpoints", "configs", "embeddings", "upscale_models",
})


def download_models():
    """Download all models. Raises if a REQUIRED model fails (loud failure)."""
    from huggingface_hub import hf_hub_download

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token:
        os.environ["HUGGINGFACE_HUB_TOKEN"] = hf_token

    comfy_models = Path(VOL_MODELS)
    cache_dir = CACHE_DIR
    for subdir in MODEL_SUBDIRS:
        (comfy_models / subdir).mkdir(parents=True, exist_ok=True)

    ok, failed, skipped = [], [], []

    def _place(subdir, repo, filepath, required, filename=None):
        if filename is None:
            filename = Path(filepath).name
        dest = comfy_models / subdir / filename
        if dest.exists():
            skipped.append(filename)
            print(f"  EXISTS: {filename}")
            return True
        try:
            src = hf_hub_download(repo_id=repo, filename=filepath, cache_dir=cache_dir)
            try:
                os.link(src, dest)  # hard link (fast, same filesystem)
            except OSError:
                shutil.copy2(src, dest)  # fallback
            size_gb = dest.stat().st_size / 1e9
            ok.append(filename)
            print(f"  HARD:   {filename} ({size_gb:.1f} GB)")
            return True
        except Exception as exc:
            tag = "REQUIRED" if required else "optional"
            failed.append({"file": filename, "required": required, "error": str(exc)})
            print(f"  FAIL:   {filename}  ({tag})  {exc}")
            return False

    for subdir, repo, filepath, required in MODELS:
        _place(subdir, repo, filepath, required)

    # Convenience symlink subdir for workflows expecting subdirectory paths.
    wan22_dir = comfy_models / "diffusion_models" / "Wan22Animate"
    wan22_dir.mkdir(parents=True, exist_ok=True)
    for fname in ("Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors",):
        src = comfy_models / "diffusion_models" / fname
        dst = wan22_dir / fname
        if src.exists() and not (dst.exists() or dst.is_symlink()):
            try:
                dst.symlink_to(src)
            except OSError:
                shutil.copy2(src, dst)

    required_failures = [f for f in failed if f["required"]]
    if required_failures:
        names = ", ".join(f["file"] for f in required_failures)
        raise RuntimeError(
            f"Required model download(s) failed: {names}. "
            f"Aborting deploy — image would be broken. See logs above."
        )

    print(f"\n=== MODELS: {len(ok)} ok, {len(failed)} failed ({len(required_failures)} required), {len(skipped)} skipped ===")
    return {"ok": ok, "failed": failed, "skipped": skipped}


def ensure_comfy_models_symlink():
    model_dir = Path(MODEL_DIR)
    vol_models = Path(VOL_MODELS)
    if not model_dir.is_symlink():
        if model_dir.exists() or model_dir.is_dir():
            shutil.rmtree(str(model_dir), ignore_errors=True)
        model_dir.symlink_to(vol_models)
        print(f"  SYMLINK: {MODEL_DIR} -> {VOL_MODELS}")

    output_dir = Path(f"{COMFY_DIR}/ComfyUI/output")
    vol_output = Path(f"{CACHE_DIR}/output")
    vol_output.mkdir(parents=True, exist_ok=True)
    if not output_dir.is_symlink():
        if output_dir.exists() or output_dir.is_dir():
            shutil.rmtree(str(output_dir), ignore_errors=True)
        output_dir.symlink_to(vol_output)


# =============================================================================
# IMAGE
# =============================================================================
CN = f"{COMFY_DIR}/ComfyUI/custom_nodes"
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "wget", "ffmpeg", "libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender-dev", "libfontconfig")
    .uv_pip_install("fastapi[standard]==0.115.4", "comfy-cli==1.5.3", "boto3", "huggingface-hub>=0.26.0")
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia --skip-manager")
    .run_commands("pip install sageattention 2>/dev/null || true")
    .run_commands(f"cd {CN} && git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && cd ComfyUI-VideoHelperSuite && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/Kijai/ComfyUI-WanVideoWrapper && cd ComfyUI-WanVideoWrapper && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/kijai/ComfyUI-KJNodes && cd ComfyUI-KJNodes && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts")
    .run_commands(f"cd {CN} && git clone https://github.com/rgthree/rgthree-comfy && cd rgthree-comfy && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/cubiq/ComfyUI_Essentials && cd ComfyUI_Essentials && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/WASasquatch/was-node-suite-comfyui && cd was-node-suite-comfyui && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/chrisgoringe/cg-use-everywhere")
    .run_commands(f"cd {CN} && git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation && cd ComfyUI-Frame-Interpolation && pip install -r requirements-no-cupy.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/1038lab/ComfyUI-RMBG && cd ComfyUI-RMBG && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch")
    .run_commands(f"cd {CN} && git clone https://github.com/fofr/ComfyUI-fofr-toolkit")
    .run_commands(f"cd {CN} && git clone https://github.com/jags111/efficiency-nodes-comfyui && cd efficiency-nodes-comfyui && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/kk8bit/KayTool && cd KayTool && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/wuwukaka/ComfyUI-WanAnimatePlus && cd ComfyUI-WanAnimatePlus && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess && cd ComfyUI-WanAnimatePreprocess && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/kijai/ComfyUI-SCAIL-Pose && cd ComfyUI-SCAIL-Pose && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/llikethat/comfyui-scail2")
    .run_commands(f"cd {CN} && git clone https://github.com/wuwukaka/ComfyUI-SDPose-OOD && cd ComfyUI-SDPose-OOD && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/aining2022/ComfyUI_Swwan && cd ComfyUI_Swwan && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/kijai/ComfyUI-segment-anything-2")
    .run_commands(f"cd {CN} && git clone https://github.com/city96/ComfyUI-GGUF")
    .run_commands(f"cd {CN} && git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack && cd ComfyUI-Impact-Pack && pip install -r requirements.txt")
    .run_commands(f"cd {CN} && git clone https://github.com/ltdrdata/ComfyUI-Manager")
    .run_commands(f"cd {CN} && git clone https://github.com/civitai/civitai-comfy-nodes && cd civitai-comfy-nodes && pip install -r requirements.txt")
    .uv_pip_install("numpy", "transformers>=4.40.0", "ninja", "packaging", "safetensors",
                    "onnxruntime-gpu", "opencv-python-headless", "scipy", "einops", "accelerate",
                    "imageio", "imageio-ffmpeg")
)

# =============================================================================
# APP + FUNCTIONS
# =============================================================================
app = modal.App(CONFIG["app_name"], image=image)


@app.function(volumes={CACHE_DIR: vol}, secrets=[modal.Secret.from_name("huggingface")], timeout=3600)
def download_all_models():
    return download_models()


@app.function(
    gpu=CONFIG["gpu"],
    memory=CONFIG["memory_mb"],
    cpu=CONFIG["cpu"],
    volumes={CACHE_DIR: vol},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=CONFIG["timeout_seconds"],
)
@modal.concurrent(max_inputs=CONFIG["max_inputs"])
@modal.web_server(8188, startup_timeout=1800)
def ui():
    import sys
    import time
    import urllib.request

    # IMPORTANT: do NOT call download_models() here on every cold start.
    # Models are prefetched onto the volume via `download_all_models` (the
    # Prefetch step) and persist across cold starts. Re-running download_models()
    # here is what caused the "URL loads for hours" symptom — every cold container
    # re-stat/re-downloaded 30+ models while Modal's proxy held the browser request.
    # Only ensure the model-dir symlinks are in place (fast, idempotent).
    ensure_comfy_models_symlink()

    # Spawn ComfyUI as a background process.
    subprocess.Popen(
        [sys.executable, f"{COMFY_DIR}/ComfyUI/main.py", "--listen", "0.0.0.0", "--port", "8188"],
        cwd=f"{COMFY_DIR}/ComfyUI",
    )

    # BLOCK until ComfyUI actually answers an HTTP request. Modal's @web_server
    # treats the function return as "container ready" — if we return before
    # ComfyUI can serve, the proxy routes browser requests to a half-started
    # container and they hang. This poll closes that gap.
    health_url = "http://127.0.0.1:8188/"
    deadline = time.time() + 300  # wait up to 5 minutes for ComfyUI to be ready
    last_err = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=5) as r:
                if r.status == 200:
                    print("=== ComfyUI is ready and serving HTTP — container is now live ===", flush=True)
                    return
        except Exception as exc:
            last_err = exc
            time.sleep(2)
    raise RuntimeError(
        f"ComfyUI did not become ready within 5 minutes (last error: {last_err}). "
        f"Check container logs."
    )


@app.local_entrypoint()
def main():
    print("Pre-downloading all models to volume...")
    print("First run takes 15-30 min. Subsequent runs are instant.")
    download_all_models.remote()
    print("\nDone! Models cached in 'wan-models' volume.")
