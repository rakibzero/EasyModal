"""
Modal ComfyUI deployment with:
  - Wan 2.2 I2V (high + low noise, fp8)
  - SCAIL-2 (fp8, fp16, GGUF Q5/Q6/Q8)
  - WanAnimate+ / Bernini / Relight
  - All custom nodes + Manager + Civitai
  - SAM2 + SAM3.1 multiplex, VitPose/YOLO/NLF

Usage:
  modal run comfyapp.py               # Pre-download all models
  modal deploy comfyapp.py              # Deploy web server (port 8188)

Requirements:
  1. Modal secret "huggingface" with key HF_TOKEN
     -> modal secret create huggingface HF_TOKEN=<your-token>
"""

import os
import subprocess
from pathlib import Path

import modal

COMFY_DIR = "/root/comfy"
MODEL_DIR = f"{COMFY_DIR}/ComfyUI/models"
CACHE_DIR = "/cache"

VOL_MODELS = f"{CACHE_DIR}/models"

vol = modal.Volume.from_name("wan-models", create_if_missing=True)


# =============================================================================
# MODEL DOWNLOAD (module-level helper, used by both Modal functions)
# =============================================================================

def download_models():
    from huggingface_hub import hf_hub_download

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token:
        os.environ["HUGGINGFACE_HUB_TOKEN"] = hf_token

    comfy_models = Path(VOL_MODELS)
    cache_dir = CACHE_DIR

    for subdir in ("diffusion_models", "text_encoders", "vae",
                    "clip_vision", "loras", "sam", "detection", "nlf",
                    "controlnet", "checkpoints", "configs", "embeddings",
                    "upscale_models"):
        (comfy_models / subdir).mkdir(parents=True, exist_ok=True)

    def _link(model_subdir, repo, filepath, filename=None):
        if filename is None:
            filename = Path(filepath).name
        dest = comfy_models / model_subdir / filename
        if dest.exists():
            print(f"  EXISTS: {dest.name}")
            return
        try:
            src = hf_hub_download(repo_id=repo, filename=filepath, cache_dir=cache_dir)
            os.link(src, dest)
            print(f"  HARD:   {dest.name} ({dest.stat().st_size / 1e9:.1f} GB)")
        except Exception:
            try:
                import shutil
                src = hf_hub_download(repo_id=repo, filename=filepath, cache_dir=cache_dir)
                shutil.copy2(src, dest)
                print(f"  COPY:   {dest.name} ({dest.stat().st_size / 1e9:.1f} GB)")
            except Exception as exc:
                print(f"  FAIL:   {filepath}  ({exc})")

    RW = "Comfy-Org/Wan_2.2_ComfyUI_Repackaged"

    print("\n=== Wan 2.2 I2V diffusion models ===")
    for f in ("wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
              "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"):
        _link("diffusion_models", RW, f"split_files/diffusion_models/{f}")

    print("\n=== Text encoder (fp8) ===")
    _link("text_encoders", RW,
          "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors")

    print("\n=== WanVideo text encoder (bf16) ===")
    _link("text_encoders", "Kijai/WanVideo_comfy",
          "umt5-xxl-enc-bf16.safetensors")

    print("\n=== VAEs ===")
    for f in ("wan_2.1_vae.safetensors", "wan2.2_vae.safetensors"):
        _link("vae", RW, f"split_files/vae/{f}")

    print("\n=== CLIP vision (from Wan2.1 repackaged) ===")
    _link("clip_vision", "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
          "split_files/clip_vision/clip_vision_h.safetensors")

    print("\n=== CLIP vision (ViT-H for SCAIL/IPAdapter) ===")
    _link("clip_vision", "f5aiteam/ComfyUI",
          "clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors")
    _link("clip_vision", "lllyasviel/misc",
          "clip_vision_vit_h.safetensors")

    print("\n=== Lightx2v LoRAs ===")
    _link("loras", "Kijai/WanVideo_comfy",
          "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors")
    _link("loras", "Kijai/WanVideo_comfy",
          "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors")
    _link("loras", "Kijai/WanVideo_comfy",
          "Lightx2v/lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank256_bf16.safetensors")

    print("\n=== Uni3C ControlNet ===")
    _link("controlnet", "Kijai/WanVideo_comfy",
          "Wan21_Uni3C_controlnet_fp16.safetensors")

    print("\n=== SCAIL-2 diffusion models ===")
    RS = "Comfy-Org/SCAIL-2"
    for f in ("wan2.1_14B_SCAIL_2_fp8_scaled.safetensors",
              "wan2.1_14B_SCAIL_2_fp16.safetensors"):
        _link("diffusion_models", RS, f"diffusion_models/{f}")

    print("\n=== SCAIL-2 DPO LoRA ===")
    _link("loras", RS, "loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors")

    print("\n=== SCAIL-2 GGUF ===")
    RG = "realrebelai/SCAIL-2_GGUF"
    for f in ("SCAIL-2-Q5_K_M.gguf", "SCAIL-2-Q6_K.gguf", "SCAIL-2-Q8_0.gguf"):
        _link("diffusion_models", RG, f)

    print("\n=== Wan2.2-Animate diffusion models ===")
    RK_FP8 = "Kijai/WanVideo_comfy_fp8_scaled"
    _link("diffusion_models", RK_FP8, "Wan22Animate/Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors")
    _link("diffusion_models", RK_FP8, "Wan22Animate/Wan2_2-Animate-14B_fp8_e5m2_scaled_KJ.safetensors")

    print("\n=== WanAnimate relight LoRAs ===")
    RK = "Kijai/WanVideo_comfy"
    for f in ("WanAnimate_relight_lora_fp16.safetensors",
              "WanAnimate_relight_lora_fp16_resized_from_128_to_dynamic_22.safetensors"):
        _link("loras", RK, f"LoRAs/Wan22_relight/{f}")

    print("\n=== SAM models ===")
    _link("sam", "Kijai/sam2-safetensors", "sam2.1_hiera_large.safetensors")
    _link("checkpoints", "Comfy-Org/sam3.1", "checkpoints/sam3.1_multiplex_fp16.safetensors")

    print("\n=== Detection models (pose / detection) ===")
    _link("detection", "JoMun/vitpose-l-wholebody", "vitpose-l-wholebody.onnx")
    _link("detection", "onnx-community/yolov10m", "onnx/model.onnx", "yolov10m.onnx")

    print("\n=== NLF ===")
    _link("nlf", RK, "SCAIL/nlf_l_multi_0.3.2_fp16.safetensors")

    print("\n=== Wan2.1 VAE bf16 ===")
    _link("vae", RK, "Wan2_1_VAE_bf16.safetensors")

    print("\n=== WanAnimatePlus subdirectory symlinks ===")
    subdir_symlinks = comfy_models / "diffusion_models"
    wan22_entries = {
        "Wan22Animate": "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors",
    }
    for subdir, files in wan22_entries.items():
        dest_dir = subdir_symlinks / subdir
        dest_dir.mkdir(parents=True, exist_ok=True)
        if isinstance(files, str):
            files = [files]
        for fname in files:
            src_file = subdir_symlinks / fname
            dst_file = dest_dir / fname
            if src_file.exists() and not (dst_file.exists() or dst_file.is_symlink()):
                try:
                    dst_file.symlink_to(src_file)
                except Exception:
                    import shutil
                    shutil.copy2(src_file, dst_file)
                print(f"  LINK:   diffusion_models/{subdir}/{fname}")

    print("\n=== ALL MODELS DOWNLOADED ===")


def ensure_comfy_models_symlink():
    import shutil
    model_dir = Path(MODEL_DIR)
    vol_models = Path(VOL_MODELS)
    if not model_dir.is_symlink():
        try:
            if model_dir.exists() or model_dir.is_dir():
                shutil.rmtree(str(model_dir), ignore_errors=True)
        except Exception as e:
            print(f"  WARN: could not remove {MODEL_DIR}: {e}")
            return
        try:
            model_dir.symlink_to(vol_models)
            print(f"  SYMLINK: {MODEL_DIR} -> {VOL_MODELS}")
        except Exception as e:
            print(f"  WARN: symlink failed: {e}")

    output_dir = Path(f"{COMFY_DIR}/ComfyUI/output")
    vol_output = Path(f"{CACHE_DIR}/output")
    vol_output.mkdir(parents=True, exist_ok=True)
    if not output_dir.is_symlink():
        try:
            if output_dir.exists() or output_dir.is_dir():
                shutil.rmtree(str(output_dir), ignore_errors=True)
        except Exception:
            pass
        try:
            output_dir.symlink_to(vol_output)
            print(f"  SYMLINK: {COMFY_DIR}/ComfyUI/output -> {CACHE_DIR}/output")
        except Exception:
            pass


# =============================================================================
# IMAGE DEFINITION
# =============================================================================

image = (
    modal.Image.debian_slim(python_version="3.11")
    # --- System packages ---
    .apt_install(
        "git", "wget", "ffmpeg",
        "libgl1", "libglib2.0-0",
        "libsm6", "libxext6", "libxrender-dev",
        "libfontconfig",
    )
    # --- Core Python ---
    .uv_pip_install(
        "fastapi[standard]==0.115.4",
        "comfy-cli==1.5.3",
        "boto3",
        "huggingface-hub>=0.26.0",
    )
    # --- Install ComfyUI (nightly = latest master, includes SCAIL-2 built-in nodes) ---
    .run_commands(
        "comfy --skip-prompt install --fast-deps --nvidia --skip-manager",
    )
    # --- SageAttention (optional) ---
    .run_commands("pip install sageattention 2>/dev/null || true")
    # ===================== CUSTOM NODES =====================
    # VideoHelperSuite
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite"
        " && pip install -r requirements.txt",
    )
    # WanVideoWrapper (Kijai)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/Kijai/ComfyUI-WanVideoWrapper",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper"
        " && pip install -r requirements.txt",
    )
    # KJNodes
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/kijai/ComfyUI-KJNodes",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-KJNodes"
        " && pip install -r requirements.txt",
    )
    # Custom Scripts (pythongosssss)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts",
    )
    # rgthree-comfy (skip npm - works with Python backend only)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/rgthree/rgthree-comfy",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/rgthree-comfy"
        " && pip install -r requirements.txt",
    )
    # Essentials
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/cubiq/ComfyUI_Essentials",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI_Essentials"
        " && pip install -r requirements.txt",
    )
    # WAS Node Suite
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/WASasquatch/was-node-suite-comfyui",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/was-node-suite-comfyui"
        " && pip install -r requirements.txt",
    )
    # cg-use-everywhere
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/chrisgoringe/cg-use-everywhere",
    )
    # Frame Interpolation (skip cupy - CPU mode)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-Frame-Interpolation"
        " && pip install -r requirements-no-cupy.txt",
    )
    # RMBG
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/1038lab/ComfyUI-RMBG",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-RMBG"
        " && pip install -r requirements.txt",
    )
    # Inpaint CropAndStitch
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch",
    )
    # fofr-toolkit
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/fofr/ComfyUI-fofr-toolkit",
    )
    # Efficiency Nodes
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/jags111/efficiency-nodes-comfyui",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/efficiency-nodes-comfyui"
        " && pip install -r requirements.txt",
    )
    # KayTool
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/kk8bit/KayTool",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/KayTool"
        " && pip install -r requirements.txt",
    )
    # WanAnimatePlus (wuwukaka)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/wuwukaka/ComfyUI-WanAnimatePlus",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-WanAnimatePlus"
        " && pip install -r requirements.txt",
    )
    # WanAnimatePreprocess (Kijai - VitPose detectors)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-WanAnimatePreprocess"
        " && pip install -r requirements.txt",
    )
    # SCAIL-Pose (Kijai)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/kijai/ComfyUI-SCAIL-Pose",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-SCAIL-Pose"
        " && pip install -r requirements.txt",
    )
    # comfyui-scail2 (llikethat - faithful SCAIL-2 wrapper)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/llikethat/comfyui-scail2",
    )
    # SDPose-OOD (wuwukaka)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/wuwukaka/ComfyUI-SDPose-OOD",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-SDPose-OOD"
        " && pip install -r requirements.txt",
    )
    # Swwan
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/aining2022/ComfyUI_Swwan",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI_Swwan"
        " && pip install -r requirements.txt",
    )
    # Segment Anything 2 (Kijai) — no requirements.txt in repo
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/kijai/ComfyUI-segment-anything-2",
    )
    # GGUF loader
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/city96/ComfyUI-GGUF",
    )
    # Impact Pack
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/ComfyUI-Impact-Pack"
        " && pip install -r requirements.txt",
    )
    # ComfyUI-Manager (always latest - we skipped it during install)
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/ltdrdata/ComfyUI-Manager",
    )
    # Civitai comfy nodes
    .run_commands(
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes"
        " && git clone https://github.com/civitai/civitai-comfy-nodes",
        f"cd {COMFY_DIR}/ComfyUI/custom_nodes/civitai-comfy-nodes"
        " && pip install -r requirements.txt",
    )
    # --- Additional Python deps ---
    .uv_pip_install(
        "numpy",
        "transformers>=4.40.0",
        "ninja",
        "packaging",
        "safetensors",
        "onnxruntime-gpu",
        "opencv-python-headless",
        "scipy",
        "einops",
        "accelerate",
        "imageio",
        "imageio-ffmpeg",
    )
)

# =============================================================================
# APP
# =============================================================================

app = modal.App("wan22-animate-scail2", image=image)


# =============================================================================
# STANDALONE MODEL DOWNLOAD
# =============================================================================

@app.function(
    volumes={CACHE_DIR: vol},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=3600,
)
def download_all_models():
    download_models()


# =============================================================================
# WEB UI (ComfyUI)
# =============================================================================

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


# =============================================================================
# LOCAL ENTRYPOINT (modal run)
# =============================================================================

@app.local_entrypoint()
def main():
    print("Pre-downloading all models to volume...")
    print("First run takes 15-30 min. Subsequent runs are instant.")
    download_all_models.remote()
    print("\nDone! Models cached in 'wan-models' volume.")
    print("Deploy web server:\n  modal deploy comfyapp.py")
