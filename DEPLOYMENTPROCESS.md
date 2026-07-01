# Deployment Process

> This document was consolidated into the `docs/` set. The full deploy lifecycle is now covered by:
>
> - **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)** — the end-to-end user flow (Setup → Keys →
>   Configure → Workflows → Deploy → Launch), including what happens at each milestone and what
>   persists across restarts.
> - **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the internal deploy pipeline: template
>   rendering, `modal deploy` orchestration, the volume + persistence symlink layer, and the
>   loading-fix (health-poll before returning).
> - **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** — every tunable, template placeholders, and
>   the deployed-container defaults (port 8188, volume `wan-models`, secret `huggingface`, timeouts).

## Summary of a deploy

1. User picks account + hardware config + workflow packs in the UI, clicks Deploy.
2. Backend activates that account's Modal profile, then renders `comfyapp.py.tpl` → `comfyapp.py`
   and validates it with `ast.parse`.
3. Backend spawns `modal deploy comfyapp.py` in a temp dir, streaming stdout/stderr over SSE.
4. Modal builds the image (Debian + ComfyUI + selected custom nodes + base64-inlined workflow JSONs).
5. The `ui` function mounts the `wan-models` volume, symlinks `models/`, `custom_nodes/`, `input/`,
   `output/`, `user/` onto it (seeding from the image on first boot), spawns ComfyUI, and
   health-polls until it answers HTTP.
6. Modal publishes a `*.modal.run` URL; the backend captures the real URL (never guessed) and shows
   it in the Launch step.

Models download once (15–30 min on first deploy) into the volume; subsequent deploys and cold starts
only re-create symlinks. Persistent dirs survive container recycling via the same volume.

See the linked docs for details.
