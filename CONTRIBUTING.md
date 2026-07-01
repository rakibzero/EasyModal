# Contributing to Wan2.2Animate Deploy

Thanks for your interest in making Modal less miserable! 🎉

## Setup

```bash
git clone <repo>
cd Wan2.2Animate
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
  Keys live in `~/.wan22-deploy/` (0600), not the repo.
- **The comfyapp.py template is the product's heart.** Changes there affect every user's
  deploy — test the render (`renderTemplate` → `ast.parse`) before committing.

## Reporting issues

Include: OS, Node version, `modal --version`, and the relevant log lines from the UI.
