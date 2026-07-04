"""
ostris/ai-toolkit deployed on Modal.com — LTX-2.3 video LoRA fine-tuning.

Usage:
  modal run aitoolkit_app.py               # Pre-download models (CPU, no GPU)
  modal deploy aitoolkit_app.py            # Deploy always-on GPU web UI

Architecture:
  - Single @web_server container (A100-80GB, 8 vCPU, 32GB RAM)
  - Next.js UI (port 8675) + Prisma SQLite worker run via concurrently
  - Monkey-patch atomic checkpoint saves + periodic Volume commit
  - Modal proxy auth (Modal-Key + Modal-Secret headers) via ModHeader
  - AI_TOOLKIT_AUTH as secondary app-level auth

Requirements (pre-existing):
  1. Modal secret "huggingface" with key HF_TOKEN
     -> modal secret create huggingface HF_TOKEN=<token>
  2. Modal secret "ai-toolkit-auth" with key AI_TOOLKIT_AUTH
     -> modal secret create ai-toolkit-auth AI_TOOLKIT_AUTH=<shared-secret>
  3. Modal proxy tokens configured in ModHeader browser extension
"""

import os
import sys
import subprocess
import shutil
import threading
import time
from pathlib import Path

import modal

# =============================================================================
# Constants
# =============================================================================

APP_NAME = "{{APP_NAME}}"
MOUNT_DIR = "/data"
TOOLKIT_DIR = "/root/ai-toolkit"
HF_CACHE_DIR = f"{MOUNT_DIR}/hf-cache"
OUTPUT_DIR = f"{MOUNT_DIR}/output"
DATASETS_DIR = f"{MOUNT_DIR}/datasets"
DB_DIR = f"{MOUNT_DIR}/db"
UI_PORT = 8675

# =============================================================================
# Volume & Secrets
# =============================================================================

vol = modal.Volume.from_name("{{VOLUME_NAME}}", create_if_missing=True)

# =============================================================================
# Directory Setup
# =============================================================================

def ensure_dirs():
    for d in [HF_CACHE_DIR, OUTPUT_DIR, DATASETS_DIR, DB_DIR]:
        Path(d).mkdir(parents=True, exist_ok=True)

# =============================================================================
# Model Pre-Download (CPU)
# =============================================================================

def download_models():
    from huggingface_hub import hf_hub_download, snapshot_download

    hf_token = os.environ.get("HF_TOKEN")
    if hf_token:
        os.environ["HUGGINGFACE_HUB_TOKEN"] = hf_token

    os.environ["HF_HOME"] = HF_CACHE_DIR
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "0"

    ensure_dirs()

    def _download(repo, filename, subdir=None):
        dest_dir = Path(HF_CACHE_DIR)
        if subdir:
            dest_dir = dest_dir / subdir
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / filename
        if dest_path.exists():
            size_gb = dest_path.stat().st_size / 1e9
            print(f"  EXISTS: {filename} ({size_gb:.1f} GB)")
            return dest_path
        try:
            path = hf_hub_download(
                repo_id=repo,
                filename=filename,
                cache_dir=str(HF_CACHE_DIR),
            )
            try:
                os.link(path, str(dest_path))
            except OSError:
                shutil.copy2(path, str(dest_path))
            size_gb = dest_path.stat().st_size / 1e9
            print(f"  DOWNLOADED: {filename} ({size_gb:.1f} GB)")
        except Exception as exc:
            print(f"  FAIL: {filename} — {exc}")
        return dest_path

    print("\n=== LTX-2.3 main checkpoint (46.1 GB) ===")
    _download("Lightricks/LTX-2.3", "ltx-2.3-22b-dev.safetensors")

    print("\n=== Gemma3-12B text encoder (24.4 GB, 5 shards) ===")
    gemma_path = snapshot_download(
        repo_id="Lightricks/gemma-3-12b-it-qat-q4_0-unquantized",
        cache_dir=str(HF_CACHE_DIR),
        ignore_patterns=["*.md", "*.png", ".gitattributes"],
    )
    print(f"  SNAPSHOT: gemma-3-12b-it-qat-q4_0-unquantized -> {gemma_path}")

    print("\n=== ALL MODELS DOWNLOADED ===")
    print(f"Models cached at: {HF_CACHE_DIR}")


# =============================================================================
# IMAGE DEFINITION
# =============================================================================

image = (
    modal.Image.debian_slim(python_version="3.11")

    # ── System packages ──
    .apt_install(
        "git", "wget", "curl", "ffmpeg",
        "libgl1", "libglib2.0-0",
        "libsm6", "libxext6", "libxrender-dev",
        "libfontconfig",
    )

    # ── Node.js 22 (newest LTS) for Next.js UI ──
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
    )

    # ── PyTorch trio FIRST (torchaudio is hidden hard dep for LTX) ──
    .pip_install(
        "torch==2.9.1",
        "torchvision==0.24.1",
        "torchaudio==2.9.1",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )

    # ── Clone ai-toolkit inside image ──
    .run_commands(
        "git clone --depth 1 https://github.com/ostris/ai-toolkit.git /root/ai-toolkit",
        "cd /root/ai-toolkit && git submodule update --init --recursive || true",
    )

    # ── Pip deps (pinned diffusers commit for LTX2 classes) ──
    .run_commands(
        "cd /root/ai-toolkit && pip install -r requirements.txt",
    )

    # ── Additional Modal deps ──
    .pip_install("python-dotenv", "boto3")

    # ── Build Next.js UI (compiled JS in dist/, .next/) ──
    .run_commands(
        "cd /root/ai-toolkit/ui && npm install",
        "cd /root/ai-toolkit/ui && npx prisma generate",
        "cd /root/ai-toolkit/ui && npm run build",
    )
{{CONFIG_BUNDLE}}
    # ── Setup HF env vars in image ──
    .env({
        "HF_HOME": HF_CACHE_DIR,
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "DISABLE_TELEMETRY": "YES",
    })
)


# =============================================================================
# APP
# =============================================================================

app = modal.App(APP_NAME, image=image)


# =============================================================================
# CPU MODEL PRE-DOWNLOAD (modal run —— no GPU)
# =============================================================================

@app.function(
    volumes={MOUNT_DIR: vol},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=7200,
)
def download_models_remote():
    print("Starting model pre-download to Volume '{{VOLUME_NAME}}'...")
    print("This runs on CPU only — no GPU used or charged.")
    download_models()
    vol.commit()
    print("\n=== PRE-DOWNLOAD COMPLETE ===")
    print("Models cached on '{{VOLUME_NAME}}' volume.")
    print("Ready for GPU deployment:\n  modal deploy aitoolkit_app.py")


# =============================================================================
# MONKEY-PATCHES (applied at web server startup, before any training code runs)
# =============================================================================

_vol_for_commit = None


def apply_safety_patches():
    """
    Two critical safety patches for resumable training on Modal:

    1. Atomic save — safetensors writes to temp file first, then os.replace().
       Prevents corruption from preemption or ctrl+c mid-checkpoint-write.
       The resume logic picks newest-ctime checkpoint; without atomic saves,
       a partially-written file looks newest and gets loaded corrupt.

    2. Periodic volume commit — after each save step, commit the Modal Volume
       so checkpoints survive container preemption. Without this, mid-training
       saves are lost (they live on local disk, not the persistent Volume).
    """
    import safetensors.torch

    # ── Patch 1: Atomic safetensors writes ──
    _original_save_file = safetensors.torch.save_file

    def _atomic_save_file(tensor_dict, filename, metadata=None):
        temp_filename = filename + ".tmp." + str(os.getpid())
        try:
            _original_save_file(tensor_dict, temp_filename, metadata)
            os.replace(temp_filename, filename)
        except Exception:
            if os.path.exists(temp_filename):
                os.unlink(temp_filename)
            raise

    safetensors.torch.save_file = _atomic_save_file

    # ── Patch 2: Network.save_weights atomic (covers LoRA/kohya save path) ──
    try:
        from toolkit.network_mixins import Network
        _orig_nw_save = Network.save_weights
        def _atomic_nw_save(self, file, dtype=None, metadata=None, extra_state_dict=None):
            save_dict = self.get_state_dict(extra_state_dict=extra_state_dict, dtype=dtype)
            if metadata is None:
                metadata = {}
            if os.path.splitext(file)[1] == ".safetensors":
                from safetensors.torch import save_file as _sf
                ftmp = file + ".tmp." + str(os.getpid())
                _sf(save_dict, ftmp, metadata)
                os.replace(ftmp, file)
            else:
                import torch
                torch.save(save_dict, file)
        Network.save_weights = _atomic_nw_save
    except ImportError:
        pass

    try:
        from toolkit.kohya_lora import LoRANetwork
        _orig_kohya_save = LoRANetwork.save_weights
        def _atomic_kohya_save(self, file, dtype, metadata):
            if os.path.splitext(file)[1] == ".safetensors":
                from safetensors.torch import save_file as _sf
                import torch
                state_dict = self.state_dict()
                if dtype is not None:
                    for k in list(state_dict.keys()):
                        v = state_dict[k]
                        state_dict[k] = v.detach().clone().to("cpu").to(dtype)
                ftmp = file + ".tmp." + str(os.getpid())
                _sf(state_dict, ftmp, metadata)
                os.replace(ftmp, file)
            else:
                _orig_kohya_save(self, file, dtype, metadata)
        LoRANetwork.save_weights = _atomic_kohya_save
    except ImportError:
        pass

    # ── Patch 3: Periodic volume commit after each training save ──
    try:
        import jobs.process.BaseSDTrainProcess as bsp
        _orig_basesd_save = bsp.BaseSDTrainProcess.save

        def _patched_basesd_save(self, step=None):
            result = _orig_basesd_save(self, step)
            if _vol_for_commit is not None:
                try:
                    _vol_for_commit.commit()
                except Exception:
                    pass
            return result

        bsp.BaseSDTrainProcess.save = _patched_basesd_save
    except ImportError:
        pass

    print("  [PATCH] Atomic save (temp+rename) applied to safetensors.torch.save_file")
    print("  [PATCH] Atomic save applied to Network.save_weights & LoRANetwork.save_weights")
    print("  [PATCH] Periodic volume commit hook installed in BaseSDTrainProcess.save")


# =============================================================================
# BACKGROUND VOLUME COMMIT THREAD
# =============================================================================

_commit_stop = threading.Event()

def _periodic_commit_thread():
    while not _commit_stop.wait(timeout=30):
        if _vol_for_commit is not None:
            try:
                _vol_for_commit.commit()
            except Exception:
                pass


# =============================================================================
# GPU WEB SERVER (always-on)
# =============================================================================

@app.function(
    gpu="{{GPU}}",
    memory={{MEMORY_MB}},
    cpu={{CPU}},
    volumes={MOUNT_DIR: vol},
    secrets=[
        modal.Secret.from_name("huggingface"),
        modal.Secret.from_name("ai-toolkit-auth"),
    ],
    timeout=86400,
)
@modal.concurrent(max_inputs=10)
@modal.web_server(UI_PORT, startup_timeout=600)
def ui():
    import torch

    global _vol_for_commit
    _vol_for_commit = vol

    print("=" * 60)
    print("  ai-toolkit Modal GPU Server starting...")
    print(f"  GPU available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        # PyTorch renamed device-properties attribute across versions: older
        # releases expose .total_mem, current (2.9+) exposes .total_memory.
        # Use getattr with a fallback so the VRAM log line never crashes the
        # whole ui() function — which is exactly what happened with a bare
        # .total_mem on torch 2.9 (AttributeError killed every cold start).
        _props = torch.cuda.get_device_properties(0)
        _vram = getattr(_props, "total_memory", None) or getattr(_props, "total_mem", None)
        if _vram is not None:
            print(f"  VRAM: {_vram / 1e9:.1f} GB")
    print("=" * 60)

    # ── 1. Apply safety patches before any training code runs ──
    apply_safety_patches()

    # ── 2. Start background commit thread ──
    _commit_stop.clear()
    commit_thread = threading.Thread(target=_periodic_commit_thread, daemon=True)
    commit_thread.start()
    print("  [BG] Periodic volume commit thread started (interval: 30s)")

    # ── 3. Set up symlinks from toolkit to Volume (outputs, datasets, DB) ──
    ensure_dirs()

    toolkit_output = Path(f"{TOOLKIT_DIR}/output")
    if toolkit_output.is_symlink() or toolkit_output.is_dir():
        try:
            if not toolkit_output.is_symlink():
                shutil.rmtree(str(toolkit_output), ignore_errors=True)
        except Exception:
            pass
    if not toolkit_output.is_symlink():
        toolkit_output.symlink_to(OUTPUT_DIR, target_is_directory=True)

    toolkit_datasets = Path(f"{TOOLKIT_DIR}/datasets")
    if toolkit_datasets.is_symlink() or toolkit_datasets.is_dir():
        try:
            if not toolkit_datasets.is_symlink():
                shutil.rmtree(str(toolkit_datasets), ignore_errors=True)
        except Exception:
            pass
    if not toolkit_datasets.is_symlink():
        toolkit_datasets.symlink_to(DATASETS_DIR, target_is_directory=True)

    # Symlink SQLite DB to Volume so job queue persists across restarts
    db_file = Path(f"{TOOLKIT_DIR}/ui/aitk_db.db")
    vol_db = Path(f"{DB_DIR}/aitk_db.db")
    if db_file.is_symlink():
        db_file.unlink()
    elif db_file.exists():
        db_file.unlink()
    vol_db.parent.mkdir(parents=True, exist_ok=True)
    db_file.symlink_to(vol_db)

    # Symlink Prisma migrations dir for fresh schema pushes
    prisma_dir = Path(f"{TOOLKIT_DIR}/ui/prisma")
    if prisma_dir.is_symlink():
        prisma_dir.unlink()
    elif prisma_dir.is_dir():
        pass  # Keep the dir, it's in the image
    # Ensure prisma schema is in place
    
    # ── 4. Push Prisma schema to create/update SQLite DB on Volume ──
    print("  [DB] Running prisma db push...")
    subprocess.run(
        ["npx", "prisma", "db", "push"],
        cwd=f"{TOOLKIT_DIR}/ui",
        env={**os.environ, "DATABASE_URL": f"file:{vol_db}"},
        capture_output=False,
    )

    # ── 5. Pre-download models if not yet cached ──
    print("  [MODEL] Checking HF model cache...")
    download_models()
    vol.commit()

    # ── 6. Launch Next.js UI ──
    print(f"  [UI] Starting Next.js on port {UI_PORT}...")
    print(f"  [UI] Access at: https://<user>--{APP_NAME}-ui.modal.run")
    print(f"  [UI] Auth: Modal-Key + Modal-Secret headers (ModHeader) + AI_TOOLKIT_AUTH")

    ui_env = {
        **os.environ,
        "PORT": str(UI_PORT),
        "DATABASE_URL": f"file:{vol_db}",
    }

    ui_proc = subprocess.Popen(
        # IMPORTANT: concurrently takes each command as ONE string arg, not a
        # shell-tokenized argv. Splitting "node dist/cron/worker.js" into two
        # args makes concurrently treat "dist/cron/worker.js" as a standalone
        # binary (Permission denied) and "next start ..." as three separate
        # commands ("start: not found"). Each command below is one shell string.
        [
            "npx", "concurrently",
            "--restart-tries", "-1",
            "--restart-after", "1000",
            "-n", "WORKER,UI",
            "node dist/cron/worker.js",
            f"next start --port {UI_PORT}",
        ],
        cwd=f"{TOOLKIT_DIR}/ui",
        env=ui_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    for line in iter(ui_proc.stdout.readline, b""):
        txt = line.decode(errors="replace").rstrip()
        print(f"  [UI] {txt}")

    _commit_stop.set()
    ui_proc.wait()


# =============================================================================
# LOCAL ENTRYPOINT (modal run)
# =============================================================================

@app.local_entrypoint()
def main():
    print("=" * 60)
    print("  ai-toolkit Modal Pre-Download")
    print("=" * 60)
    print()
    print("This will download ~71 GB of model files to the '{{VOLUME_NAME}}' volume.")
    print("No GPU will be used. The web server is NOT deployed.")
    print()
    print("After this completes, deploy the GPU server with:")
    print("  modal deploy aitoolkit_app.py")
    print()

    handle = download_models_remote.spawn()
    # Wait for completion (function has timeout=7200, but .get() with explicit 
    # timeout so we don't lose connection while downloading ~71 GB)
    try:
        handle.get(timeout=3600)
        print("\n=== PRE-DOWNLOAD COMPLETE ===")
        print("Models cached on '{{VOLUME_NAME}}' volume.")
        print("Ready for GPU deployment:\n  modal deploy aitoolkit_app.py")
    except TimeoutError:
        print("\nDownload still running in background (large files).")
        print("Check progress: modal volume ls {{VOLUME_NAME}} hf-cache/")
        print("The function continues independently — no need to re-run.")
