# Contributing to EasyModal

Thanks for your interest in making Modal less miserable! 🎉

## Setup

```bash
git clone <repo>
cd easymodal
npm install
npm run dev
```

- **Web UI:** http://localhost:5173 (proxies `/api` → backend)
- **Backend:** http://127.0.0.1:7421

## Architecture

- `apps/web/` — React + Vite + TypeScript + Tailwind (the UI)
- `apps/server/` — Fastify + TypeScript (local backend; orchestrates the Modal CLI)
- `packages/shared/` — Shared TS types (`Account`, `Instance`, `LogEvent`, …)
- `apps/server/templates/comfyapp.py.tpl` — The clean bundled ComfyUI-on-Modal template

The backend shells out to the **`modal` CLI** (deploy, token set, secret put, app list).
The bundled `comfyapp.py` template is rendered with the user's config, written to a temp
dir, and deployed from there. Compute stays on the user's Modal account.

## Scripts

| Command | What |
|---------|------|
| `npm run dev` | Start web + server with hot reload |
| `npm run build` | Build all workspaces |
| `npm start` | Build, then run the production server (serves the built UI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |

## Guidelines

- **TypeScript strict** — no `any` without a comment explaining why.
- **Keep the UX kind.** Every screen: one clear primary action, plain-language status,
  what-to-do-next, visible errors with a fix suggestion. No jargon.
- **Never commit secrets.** `.gitignore` already excludes `.env` and `.launcher.env`.
  Keys live in `~/.easymodal/` (0600), not the repo.
- **The comfyapp.py / aitoolkit_app.py templates are the product's heart.** Changes there affect
  every user's deploy. Two guards run on every render:
  - `assertNoJsTokensInPython(source)` in `cli.ts` — strips comments + string literals, then
    fails if it finds a bare `true`/`false`/`null`/`undefined` (these are syntactically valid
    Python names that pass `ast.parse` but throw `NameError` at runtime — the bug that broke
    image-edit deploys). If you add a new interpolation that touches a JS value, verify the
    guard still passes by rendering and compiling:
    ```bash
    node --input-type=module -e "import('./apps/server/dist/modal/cli.js').then(m=>console.log('ok'))"
    python3 -c "import ast; ast.parse(open('/tmp/rendered.py').read())"
    ```
  - Every Modal CLI spawn must use `modalEnv()` from `modal/env.ts` (forces UTF-8) — never
    `env: process.env` directly, which reintroduces the Windows charmap crash.

## Reporting issues

Include: OS, Node version, `modal --version`, and the relevant log lines from the UI.
