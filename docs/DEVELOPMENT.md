# Development

How to run, build, and extend the Wan2.2Animate Deploy app locally.

## Local setup

```bash
git clone <repo-url> wan22-animate
cd wan22-animate
npm install      # npm workspaces — installs all three workspaces
npm run dev      # web (Vite :5173) + server (Fastify :7421) concurrently
```

Open http://localhost:5173. The Vite dev server proxies `/api` → `http://127.0.0.1:7421`.

For a one-shot build+run (serves the built bundle from the server):
```bash
npm start        # = npm run build && npm -w apps/server run start
```

You'll still need the `modal` CLI on your PATH (`pip install modal`) for deploys to work — the
Setup step checks for it.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run web + server concurrently with live reload. |
| `npm run build` | Clean + build `packages/shared` → `apps/web` → `apps/server`. |
| `npm start` | Build then start the server (serves the built web bundle). |
| `npm run typecheck` | `tsc -b` across workspaces. |
| `npm run clean` | Remove `dist/` and `*.tsbuildinfo` (composite-build cache poisoning fix). |

Per-workspace scripts live in each `package.json` under `apps/*` and `packages/*`.

## Project structure

```
apps/web/                    Frontend — React 18 + Vite 6 + TS 5.7 + Tailwind v4
  src/pages/                 SetupPage, KeysPage, ConfigurePage, WorkflowsPage,
                             DeployPage, LaunchPage (one per step)
  src/components/            Banner, StatusDot, KeyInput, StepRail, …
  src/store/appStore.ts      Zustand store, persists to localStorage
  src/api/client.ts          REST + SSE client
apps/server/                 Backend — Fastify 5 + TS
  src/main.ts                Entry: port discovery, route registration, static serve
  src/routes/                health, prereqs, accounts, instances, workflows, events
  src/modal/cli.ts           Template rendering + modal deploy/run orchestration
  src/modal/packs.ts         Core nodes + per-pack node/model definitions
  src/modal/milestones.ts    Log-line → milestone classifier
  src/accounts/modal.ts      modal CLI wrappers (validate, activate, secret put)
  src/repo/                  configStore.ts, instances.ts (0600 local JSON stores)
  src/events/bus.ts          SSE event bus
  templates/comfyapp.py.tpl  THE rendered template
  workflows/                 wan22/ image-edit/ upscaling/ bundled JSONs
packages/shared/             Shared TS types + option constants
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces interact.

## Common development tasks

### Add a custom node (always installed)

Edit `apps/server/src/modal/packs.ts` → `CORE_NODES`:

```typescript
{ url: 'https://github.com/owner/ComfyUI-MyNode', hasRequirements: true },
```

`hasRequirements: true` makes the renderer emit `&& cd <name> && pip install -r requirements.txt`.
For a non-standard requirements file, add `requirementsFile: 'requirements-no-cupy.txt'`.

### Add a custom node to a specific pack

Edit `apps/server/src/modal/packs.ts` → `PACKS[<packId>].nodes`. Same shape.

### Add a model to a pack

Edit `PACKS[<packId>].models`:

```typescript
{ subdir: 'diffusion_models', repo: 'org/repo', filepath: 'path/file.safetensors', required: false },
```

`required: true` aborts the deploy if the download fails (loud failure). Use `false` for
best-effort/optional models.

### Add a bundled workflow

Drop a `.json` into `apps/server/workflows/<pack>/`. It's automatically picked up by
`collectWorkflows()` on the next deploy and base64-inlined into the image, and appears in the
**Workflows** step catalog.

### Add/modify a template placeholder

1. Add `{{NAME}}` to `apps/server/templates/comfyapp.py.tpl`.
   - **Must be at column 0** if it expands to multi-line code (the template's own indent would
     double-indent it and break the `image = (...)` chain).
   - **Must never sit inside a `#` comment line** — the expansion would land inside the comment.
2. Add a `.replaceAll('{{NAME}}', …)` in `renderTemplate()` (`apps/server/src/modal/cli.ts`).
3. Rebuild and verify: render the template, then `python3 -c "import ast; ast.parse(open('rendered.py').read())"`.

### Add a new configuration option

1. Add the field to `DeployConfig` in `apps/server/src/modal/cli.ts` + `DEFAULT_DEPLOY_CONFIG`.
2. Add it to `DeployConfig` in `packages/shared/src/types.ts` (single source for both sides).
3. Add a UI control in `apps/web/src/pages/ConfigurePage.tsx` and to `DEFAULT_CONFIG` in `appStore.ts`.
4. Add the placeholder to `comfyapp.py.tpl` if it needs to reach the container.

### Add a route

Add a handler in the relevant file under `apps/server/src/routes/`, register it in `main.ts` if
it's a new route file. The SSE bus (`src/events/bus.ts`) is how you push live updates to the UI.

## Debugging

- **Deploy log stuck / buffered:** Modal buffers image-build output; a "stuck" log usually means a
  long C/Rust wheel compile (e.g., stringzilla). Wait — output flushes when the step completes.
- **Rendered template is invalid Python:** Run `renderTemplate()` and `ast.parse` the output.
  90% of the time it's a placeholder indent issue (see above) or a placeholder inside a comment.
- **Wrong account targeted:** `activateAccountProfile` runs before every deploy/reset/switch. If a
  reset hits the wrong account, check the instance's `accountId` matches the account you expect.
- **`.tsbuildinfo` poisoning:** stale composite-build info can skip emit. `npm run clean` then rebuild.

## Testing a deploy manually

The app's deploy path is `modal deploy comfyapp.py` in a temp dir. To test the rendered template
yourself without the UI:

```bash
# from apps/server
node -e 'const {renderTemplate}=require("./dist/modal/cli.js");\
  require("fs").writeFileSync("/tmp/x.py",\
  renderTemplate({appName:"wan22-test",gpu:"A100-80GB",maxInputs:2,\
  timeoutSeconds:1800,memoryMb:32768,cpu:8,packs:["wan22"]}))'
python3 -c "import ast; ast.parse(open('/tmp/x.py').read()); print('ok')"
MODAL_PROFILE=<profile> modal deploy /tmp/x.py
MODAL_PROFILE=<profile> modal app stop wan22-test --yes   # when done
```

> Real deploys spend Modal credits and take 15–30 min on a fresh volume. For plumbing-only checks,
  temporarily trim the `MODELS` list to one small required file, verify the build + web_server +
  URL work, then restore the full list.
