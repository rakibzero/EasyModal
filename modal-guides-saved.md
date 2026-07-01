# Modal.com Full Documentation Guide (Saved)

Source: https://modal.com/docs/guide

## Table of Contents

1. [Introduction](#1-introduction)
2. [Images (Custom Container Images)](#2-images)
3. [GPUs](#3-gpus)
4. [Apps, Functions, and Entrypoints](#4-apps-functions-entrypoints)
5. [Servers](#5-servers)
6. [Scaling Out](#6-scaling-out)
7. [Sandboxes](#7-sandboxes)
8. [Volumes](#8-volumes)
9. [Secrets](#9-secrets)
10. [Web Functions](#10-web-functions)
11. [Cold Start Performance](#11-cold-start)
12. [Memory Snapshots](#12-memory-snapshots)
13. [Container Lifecycle Hooks](#13-lifecycle-hooks)
14. [Scheduling (Cron Jobs)](#14-scheduling)
15. [Retries & Failures](#15-retries)
16. [Tunnels](#16-tunnels)
17. [CPU, Memory, Disk Resources](#17-resources)
18. [Input Concurrency](#18-input-concurrency)
19. [Continuous Deployment](#19-cd)
20. [Developing & Debugging](#20-debugging)
21. [Storing Model Weights](#21-model-weights)

---

## 1. Introduction

Modal is an AI infrastructure platform that lets you:
- Run low latency inference with sub-second cold starts
- Scale out batch jobs to run massively in parallel
- Train or fine-tune models on the latest GPUs
- Spin up thousands of isolated Sandboxes
- Launch GPU-backed Notebooks

**Serverless**: You pay per second of usage. No YAML, no Kubernetes — everything is code.

### Minimal Example

```python
from pathlib import Path
import modal

app = modal.App("example-inference")
image = modal.Image.debian_slim().uv_pip_install("transformers[torch]")

@app.function(gpu="h100", image=image)
def chat(prompt: str | None = None) -> list[dict]:
    from transformers import pipeline
    if prompt is None:
        prompt = f"/no_think Read this code.\n\n{Path(__file__).read_text()}\nIn one paragraph, what does the code do?"
    context = [{"role": "user", "content": prompt}]
    chatbot = pipeline(model="Qwen/Qwen3-1.7B", device_map="cuda", max_new_tokens=1024)
    result = chatbot(context)
    return result
```

Run with: `modal run path/to/file.py`

### Getting Started
1. Create account at modal.com
2. `pip install modal`
3. `modal setup` (or `python -m modal setup`)

---

## 2. Images

Images define the container environment for your Modal code. Build via method chaining:

```python
image = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("git")
    .uv_pip_install("torch<3")
    .env({"HALT_AND_CATCH_FIRE": "0"})
    .run_commands("git clone https://github.com/modal-labs/agi")
)
```

### Key Methods

| Method | Purpose |
|--------|---------|
| `.debian_slim()` | Base Debian image |
| `.uv_pip_install(...)` | Install Python packages with `uv` (recommended) |
| `.pip_install(...)` | Install with standard `pip` (fallback) |
| `.apt_install(...)` | Install system packages |
| `.env({...})` | Set environment variables |
| `.run_commands(...)` | Run shell commands during build |
| `.run_function(func, ...)` | Run Python function as build step |
| `.add_local_dir(...)` | Add local directory to image |
| `.add_local_file(...)` | Add local file to image |
| `.add_local_python_source(...)` | Add Python module to image |
| `.micromamba()` / `.micromamba_install(...)` | Use mamba/conda packages |

### Using External Images

Use `modal.Image.from_registry("ubuntu:24.04")` for Docker registry images.

### Image Caching & Rebuilds

- Images cached per layer
- `force_build=True` to force rebuild
- `MODAL_FORCE_BUILD=1` env var to rebuild all images
- `MODAL_IGNORE_CACHE=1` to rebuild without breaking cache

### GPUs During Build

```python
image = modal.Image.debian_slim().pip_install("bitsandbytes", gpu="H100")
```

---

## 3. GPUs

### Specifying GPU Type

```python
@app.function(gpu="A100")
def run():
    import torch
    assert torch.cuda.is_available()
```

### Available GPUs

| GPU | VRAM | Notes |
|-----|------|-------|
| T4 | 16 GB | Entry-level |
| L4 | 24 GB | |
| A10 | 24 GB | |
| L40S | 48 GB | **Recommended** for inference |
| A100-40GB | 40 GB | |
| A100-80GB | 80 GB | |
| RTX-PRO-6000 | | |
| H100/H200 | 80/141 GB | High-end |
| B200/B200+ | | Latest Blackwell |

### Multi-GPU

```python
@app.function(gpu="H100:8")  # 8 GPUs
def run_llama_405b():
    ...
```

B200, H200, H100, A100, L4, T4, L40S: up to 8 GPUs. A10: up to 4 GPUs.

### GPU Fallbacks

```python
@app.function(gpu=["H100", "A100-40GB:2"])
def run():
    ...
```

### Automatic Upgrades

- `gpu="H100"` may auto-upgrade to H200 at same cost
- `gpu="H100!"` with `!` to force exact GPU type

---

## 4. Apps, Functions, Entrypoints

### App

```python
app = modal.App(name="my-modal-app")
```

### Ephemeral Apps

```bash
modal run script.py
```

```python
with app.run():
    some_modal_function.remote()
```

### Deployed Apps

```bash
modal deploy script.py
```

Persisted indefinitely until stopped. Functions with schedules run automatically.

### Entrypoints

```python
@app.local_entrypoint()
def main(foo: int, bar: str):
    some_modal_function.remote(foo, bar)
```

CLI args auto-parsed: `modal run script.py --foo 1 --bar "hello"`

### Multiple Functions

```python
@app.function()
def f():
    print("Hello")

@app.function()
def g():
    print("Goodbye")

@app.local_entrypoint()
def main():
    f.remote()
    g.remote()
```

---

## 5. Servers

Modal Servers are optimized for low-latency HTTP communication.

```python
@app.server(unauthenticated=True)
class Server:
    @modal.enter()
    def startup(self):
        import subprocess
        subprocess.Popen("python -m http.server -d / 8000", shell=True)
```

### Key Differences from Functions

| Feature | Functions | Servers |
|---------|-----------|---------|
| Input model | One input at a time | Concurrent requests |
| Autoscaling | Built-in | Must set `target_concurrency=` |
| Queueing | Inputs queue | Requests get 503 if no container |
| Default auth | No | Requires `Modal-Key`/`Modal-Secret` headers |
| Container ready | After `@modal.enter` | After port is listening |

### Key Parameters

- `target_concurrency`: Controls autoscaling
- `min_containers`, `max_containers`, `buffer_containers`
- `scaleup_window`, `scaledown_window`
- `startup_timeout`: Time to wait for port
- `exit_grace_period`: Time for inflight requests to complete

### Routing Regions

`us-east` (default), `us-west`, `eu-west`, `ap-south`

---

## 6. Scaling Out

### Autoscaling Parameters

```python
@app.function(
    min_containers=2,      # Keep at least 2 warm
    max_containers=10,     # Upper limit
    buffer_containers=3,   # Extra during active periods
    scaledown_window=300,  # Keep idle containers for 5 min
)
def my_function():
    ...
```

### Dynamic Autoscaler Updates

```python
f = modal.Function.from_name("my-app", "f")
f.update_autoscaler(max_containers=100)
```

### Parallel Execution (map)

```python
for result in evaluate_model.map(inputs):  # parallel
    ...

# Starmap for multiple args
list(my_func.starmap([(1, 2), (3, 4)]))
```

### Limits

- 2,000 pending inputs (1,000,000 for `.spawn()`)
- 25,000 total inputs
- `.map()`: 1000 inputs concurrently

---

## 7. Sandboxes

Secure containers for executing untrusted or agent code.

### Basic Usage

```python
sb_app = modal.App.lookup("my-app", create_if_missing=True)
sb = modal.Sandbox.create(app=sb_app)

p = sb.exec("python", "-c", "print('hello')", timeout=3)
print(p.stdout.read())

sb.terminate()
sb.detach()
```

### Lifecycle Events

1. **Created** — Requested, registered
2. **Scheduled** — Worker assigned, resources provisioning
3. **Started** — Container launched, entrypoint running
4. **Ready** — Readiness probe succeeded (if configured)
5. **Finished** — Stopped running

### Timeouts

- Default max: 5 minutes
- Up to: 24 hours (`timeout=10*60` for 10 min)
- Idle timeout: `idle_timeout` parameter

### Readiness Probes

```python
# TCP probe — wait for port
sb = modal.Sandbox.create(
    "python3", "-m", "http.server", "8080",
    readiness_probe=modal.Probe.with_tcp(8080),
    app=sb_app,
)
sb.wait_until_ready()

# Exec probe — wait for command to succeed
sb = modal.Sandbox.create(
    "bash", "-c", "sleep 5 && touch /tmp/ready",
    readiness_probe=modal.Probe.with_exec("sh", "-c", "test -f /tmp/ready"),
    app=sb_app,
)
sb.wait_until_ready()
```

### Named Sandboxes

```python
sb = modal.Sandbox.create(app=sb_app, name="my-name")
# Must be unique per app
```

### Tags

```python
sb.set_tags({"major_version": "1", "minor_version": "2"})
for sandbox in modal.Sandbox.list(app_id=sb_app.app_id, tags={"major_version": "1"}):
    ...
```

### Cleaning Up

```python
sb.detach()  # Always call detach when done
```

---

## 8. Volumes

High-performance distributed file system for Modal applications.

### Creating & Using Volumes

```bash
modal volume create my-volume
```

```python
vol = modal.Volume.from_name("my-volume")

@app.function(volumes={"/data": vol})
def run():
    with open("/data/xyz.txt", "w") as f:
        f.write("hello")
    vol.commit()  # Persist changes
```

### Mount Options

```python
# Read-only mount
vol.with_mount_options(read_only=True)

# Sub-path mount
vol.with_mount_options(sub_path="/users/user_123")
```

### Key Operations

| CLI Command | Purpose |
|-------------|---------|
| `modal volume create my-volume` | Create volume |
| `modal volume ls my-volume` | List files |
| `modal volume get my-volume src dst` | Download file |
| `modal volume put my-volume src dst` | Upload file |
| `modal volume rm my-volume path` | Delete file |
| `modal volume delete my-volume` | Delete volume |

### Consistency

- Concurrent writes to same file: last-write-wins
- Max ~5 concurrent commits on v1
- Volumes v2 (Beta): unlimited files, hundreds of concurrent writers
- `sync /path/to/mountpoint` to commit from shell (v2 only)

### Performance

- Up to 2.5 GB/s bandwidth
- v1: <50K files recommended, 500K hard limit
- v2: unlimited files

---

## 9. Secrets

Securely provide credentials to Modal Functions.

### Creating Secrets

```bash
modal secret create database-secret PGHOST=uri PGPORT=5432 PGUSER=admin PGPASSWORD=hunter2
```

Or via [dashboard](https://modal.com/secrets).

### Using Secrets

```python
@app.function(secrets=[modal.Secret.from_name("secret-keys")])
def some_function():
    import os
    secret_key = os.environ["MY_PASSWORD"]
```

### Programmatic Secrets

```python
local_secret = modal.Secret.from_dict({"FOO": "bar"})

# From .env file
secret = modal.Secret.from_dotenv()
```

### Limits

- Key names: max 16,384 chars (letters, digits, underscores)
- Values: max 32,768 chars
- Use Volumes for larger data

---

## 10. Web Functions

### Simple Endpoints

```python
@app.function(image=image)
@modal.fastapi_endpoint()
def f():
    return "Hello world!"

@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def square(item: dict):
    return {"square": item['x']**2}
```

### ASGI Apps (FastAPI, Starlette)

```python
@app.function(image=image)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI
    web_app = FastAPI()

    @web_app.post("/echo")
    async def echo(request: Request):
        return await request.json()

    return web_app
```

### WSGI Apps (Flask, Django)

```python
@app.function(image=image)
@modal.concurrent(max_inputs=100)
@modal.wsgi_app()
def flask_app():
    from flask import Flask
    web_app = Flask(__name__)

    @web_app.post("/echo")
    def echo():
        return request.json

    return web_app
```

### Non-ASGI Web Servers

```python
@app.function()
@modal.concurrent(max_inputs=100)
@modal.web_server(8000)
def my_file_server():
    import subprocess
    subprocess.Popen("python -m http.server -d / 8000", shell=True)
```

### Development & Deployment

```bash
modal serve script.py    # Live-updating development
modal deploy script.py   # Production deployment
```

### Authentication

- `@modal.fastapi_endpoint`: No authentication by default
- `@modal.server`: Requires `Modal-Key`/`Modal-Secret` unless `unauthenticated=True`

### Limits

- Workspace rate limit: 200 requests/second default (5s burst)
- Request body: up to 4 GiB
- Response body: unlimited

---

## 11. Cold Start Performance

### Two Sources of Latency

1. **Queueing time** — waiting for a warm container
2. **Initialization** — work done on first invocation (imports, model loading)

### Reduce Queueing Time

```python
# Keep containers warm
@app.function(scaledown_window=300)     # Keep idle for 5 min
@app.function(min_containers=3)          # Always keep 3 warm
@app.function(buffer_containers=3)       # Extra during activity
```

### Reduce Initialization Latency

- Move work to global scope or `@modal.enter()`
- Download model weights into Volume (not during boot)
- Load large files concurrently (ThreadPoolExecutor)
- Use Memory Snapshots

### Concurrent IO Pattern

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def load_models_concurrently(load_functions_map):
    model_id_to_model = {}
    with ThreadPoolExecutor(max_workers=len(load_functions_map)) as executor:
        future_to_model_id = {
            executor.submit(load_fn): model_id
            for model_id, load_fn in load_functions_map.items()
        }
        for future in as_completed(future_to_model_id):
            model_id_to_model[future_to_model_id[future]] = future.result()
    return model_id_to_model
```

---

## 12. Memory Snapshots

Dramatically reduce cold start latency by saving container memory state.

### CPU Memory Snapshots

```python
@app.function(enable_memory_snapshot=True)
def my_func():
    ...

# With imports
image = modal.Image.debian_slim().uv_pip_install("pandas")
with image.imports():
    import pandas as pd

@app.function(enable_memory_snapshot=True, image=image)
def my_func():
    print(f"pandas v{pd.__version__}")
```

### Container Lifecycle Hooks & Snapshots

```python
@app.cls(enable_memory_snapshot=True)
class MyCls:
    @modal.enter(snap=True)     # Will be captured in snapshot
    def load(self):
        ...

    @modal.enter()              # Will NOT be captured
    def load_more(self):
        ...
```

### GPU Memory Snapshots (Alpha)

```python
@app.function(
    gpu="a10",
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True}
)
def my_gpu_func():
    ...
```

### Best Practices

- Warm up models before snapshotting (run a few forward passes)
- CPU snapshots block GPU access — use two-phase init (CPU load → snapshot → move to GPU)
- Use `XFORMERS_ENABLE_TRITON=1` with xformers
- Re-import PyTorch after snapshot restore to fix CUDA state

---

## 13. Container Lifecycle Hooks

### @modal.enter — Container Startup

```python
@app.cls(cpu=8)
class Model:
    @modal.enter()
    def run_this_on_container_startup(self):
        import pickle
        self.model = pickle.load(open("model.pickle"))

    @modal.method()
    def predict(self, x):
        return self.model.predict(x)
```

### @modal.exit — Container Shutdown

```python
@app.cls()
class ETLPipeline:
    @modal.exit()
    def close_connection(self):
        self.connection.close()
```

Exit handlers get 30s grace period before SIGKILL.

### Web Functions with Lifecycle Hooks

```python
@app.cls()
class Model:
    @modal.enter()
    def load(self):
        self.model = pickle.load(open("model.pickle"))

    @modal.fastapi_endpoint()
    def predict(self, request: Request):
        ...
```

---

## 14. Scheduling (Cron Jobs)

### Period Schedule

```python
@app.function(schedule=modal.Period(days=1))
def perform_daily():
    ...

@app.function(schedule=modal.Period(hours=5))
def every_five_hours():
    ...
```

### Cron Schedule

```python
@app.function(schedule=modal.Cron("0 8 * * 1"))          # 8am UTC every Monday
@app.function(schedule=modal.Cron("0 6 * * *", timezone="America/New_York"))  # 6am NY
```

### Deployment

```bash
modal deploy --name daily_heavy heavy.py
```

---

## 15. Retries & Failures

### Automatic Retries

```python
@app.function(retries=3)
def my_flaky_function():
    pass
```

### Map with Exceptions

```python
list(my_func.map(range(3), return_exceptions=True))
```

### Container Crashes

- Ephemeral apps: retried until failure rate exceeded
- Deployed apps: retried indefinitely with crash-loop backoff

---

## 16. Tunnels

Expose live TCP ports on a Modal container to the public Internet.

### Basic Tunnel

```python
@app.function()
def start_app():
    with modal.forward(8000) as tunnel:
        print(f"tunnel.url = {tunnel.url}")
        print(f"tunnel.tls_socket = {tunnel.tls_socket}")
        # start web server on port 8000
```

### Unencrypted TCP Tunnel

```python
with modal.forward(8000, unencrypted=True) as tunnel:
    print(f"tunnel.tcp_socket = {tunnel.tcp_socket}")
```

### Use Cases

- Jupyter notebooks
- VS Code servers
- Debugging sessions
- Interactive terminals (ttyd)

### Security

- URLs are cryptographically random
- Auto TLS encryption
- Public on the internet (anyone with URL can access)
- No additional charge for tunnels

---

## 17. CPU, Memory, Disk Resources

### CPU

```python
@app.function(cpu=8.0)
def my_function():
    ...

# With explicit limit
@app.function(cpu=(1.0, 4.0))  # request, limit
def f():
    ...
```

Default: 0.125 cores. Soft limit: 16 cores above request.

### Memory

```python
@app.function(memory=32768)  # 32 GiB
def my_function():
    ...

# With explicit limit
@app.function(memory=(1024, 2048))  # request 1 GiB, limit 2 GiB
def f():
    ...
```

Default: 128 MiB.

### Disk

```python
@app.function(ephemeral_disk=1048576)  # 1 TiB
def my_function():
    ...
```

- Default: 512 GiB
- Max: 3.0 TiB
- Billed by increasing memory request at 20:1 ratio

---

## 18. Input Concurrency

Process multiple inputs simultaneously in a single container.

### Enabling

```python
@app.function()
@modal.concurrent(max_inputs=100)
def my_function(input: str):
    ...
```

### Class Pattern

```python
@app.cls()
@modal.concurrent(max_inputs=100)
class MyCls:
    @modal.method()
    def my_method(self, input: str):
        ...
```

### Concurrency Target

```python
@modal.concurrent(max_inputs=96, target_inputs=80)  # 20% burst
```

### Mechanisms

- **Synchronous functions**: concurrent inputs run on separate threads (**must be thread-safe**)
- **Asynchronous functions**: concurrent inputs run as asyncio tasks

### Gotchas

- Input cancellation: synchronous = entire container killed; async = `asyncio.CancelledError`
- Logs from different inputs interleave
- Use `modal.current_input_id()` to correlate logs

---

## 19. Continuous Deployment

### GitHub Actions Example

```yaml
name: CI/CD

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
      MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}

    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      - run: pip install modal
      - run: modal deploy -m my_package.my_file
```

Get tokens from: https://modal.com/settings/tokens

---

## 20. Developing & Debugging

### Interactive Mode

```bash
modal run -i script.py
```

```python
@app.function()
def my_fn(hidden):
    modal.interact()
    x = input("Enter a number: ")
    ...
```

### Debug Shell on Running Container

```bash
modal container list
modal shell <container-id>
```

Comes with vim, nano, ps, strace, curl, py-spy pre-installed.

### Exec Command in Container

```bash
modal container exec <container-id> ls /root
```

### Live Container Profiling

Available in Modal web dashboard **Containers** tab.

### Hot Reloading

```bash
modal serve script.py
```

Auto-updates on file changes. Works with web functions, cron, and job queues.

### Debug Logs

```bash
MODAL_LOGLEVEL=DEBUG modal run hello.py
```

Or via Secret:

```python
@app.function(secrets=[modal.Secret.from_dict({"MODAL_LOGLEVEL": "DEBUG"})])
```

---

## 21. Storing Model Weights

### Recommended: Modal Volume

```python
volume = modal.Volume.from_name("model-weights-vol", create_if_missing=True)
MODEL_DIR = Path("/models")

@app.function(gpu="any", volumes={MODEL_DIR: volume})
def train_model(data, config):
    model = run_training(config, data)
    model.save(config, MODEL_DIR)
```

### Download into Volume

```python
@app.function(volumes={MODEL_DIR: volume})
def download_model(model_id):
    import model_hub
    model_hub.download(model_id, local_dir=MODEL_DIR / model_id)
```

### Upload from Local

```python
volume = modal.Volume.from_name("model-weights-vol")
with volume.batch_upload() as upload:
    upload.put_directory(local_path, remote_path)
```

Or via CLI: `modal volume put model-weights-vol path/to/model path/on/volume`

### Load Once with @modal.enter

```python
@app.cls(gpu="any", volumes={MODEL_DIR: volume})
class Model:
    @modal.enter()
    def setup(self):
        self.model = load_model(MODEL_DIR, model_id)

    @modal.method()
    def inference(self, prompt):
        return self.model.run(prompt)
```

### Hugging Face Hub

```python
download_image = modal.Image.debian_slim().pip_install("huggingface_hub").env({"HF_XET_HIGH_PERFORMANCE": "1"})

@app.function(volumes={MODEL_DIR.as_posix(): volume}, image=download_image)
def download_model(repo_id="hf-internal-testing/tiny-random-GPTNeoXForCausalLM", revision=None):
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=repo_id, local_dir=MODEL_DIR / repo_id, revision=revision)
```

---

*Saved from https://modal.com/docs/guide on 2026-06-24*
