# Testing

There is no automated test suite. Validation is manual, split across three layers: type/build
checks, template-render checks, and live deploy checks.

## 1. Type + build checks (fast, run before every commit)

```bash
npm run typecheck   # tsc -b across all workspaces
npm run build       # full clean build (shared → web → server)
```

If the build fails with stale errors after edits, run `npm run clean` first — composite-build
`*.tsbuildinfo` files can poison incremental builds.

## 2. Template-render checks (fast, catches deploy-time Python errors)

The rendered `comfyapp.py` must be valid Python. Verify both the wan22-only and all-packs configs:

```bash
cd apps/server
node -e '
  const { renderTemplate } = require("./dist/modal/cli.js");
  const fs = require("fs");
  const cfg = (packs) => ({ appName:"wan22-test", gpu:"A100-80GB", maxInputs:2,
    timeoutSeconds:1800, memoryMb:32768, cpu:8, packs });
  for (const packs of [["wan22"], ["wan22","image-edit","upscaling"]]) {
    const out = renderTemplate(cfg(packs));
    const leftovers = (out.match(/\{\{[A-Z_]+\}\}/g) || []).length;
    fs.writeFileSync(`/tmp/render-${packs.length}.py`, out);
    console.log(`packs=${packs}: ${leftovers} leftover placeholders`);
  }'
python3 -c "import ast; ast.parse(open('/tmp/render-1.py').read()); print('wan22-only: VALID')"
python3 -c "import ast; ast.parse(open('/tmp/render-3.py').read()); print('all-packs: VALID')"
```

Pass criteria:
- `0` leftover placeholders in both renders.
- Both pass `ast.parse` (i.e., `compile()` would succeed).

Common failure: a placeholder that expands to multi-line code is indented inside the template, or
sits inside a `#` comment line. See [DEVELOPMENT.md](DEVELOPMENT.md#addmodify-a-template-placeholder).

## 3. Endpoint smoke tests (fast, server running)

With the server up (`npm run dev` or `npm start`), hit each endpoint:

```bash
curl -s localhost:7421/api/health       | jq .          # → {status:"ok"}
curl -s localhost:7421/api/prereqs      | jq .allOk     # → true
curl -s localhost:7421/api/accounts     | jq .accounts  # → [...]
curl -s localhost:7421/api/instances    | jq .instances # → [...]
curl -s localhost:7421/api/workflows    | jq '.categories[] | {label, count:(.files|length)}'
# deploy gate (no account) → 400
curl -s -XPOST localhost:7421/api/instances/deploy -H 'Content-Type: application/json' -d '{}'
# reset gate (bad id) → 404
curl -s -XPOST localhost:7421/api/instances/nope/reset-nodes -d '{}'
```

## 4. Live deploy check (slow, spends credits)

The only true proof. Covered in [GETTING-STARTED.md](GETTING-STARTED.md#6-deploy). Checklist:

- [ ] Image builds without error (all selected custom nodes clone + pip install).
- [ ] Models download (or skip via volume cache) — no `REQUIRED` failures.
- [ ] `ui()` health-polls and returns — Modal publishes the URL.
- [ ] ComfyUI loads in a browser: page title becomes `*Unsaved Workflow - ComfyUI`.
- [ ] ComfyUI Manager button present; all bundled custom nodes appear in the templates dialog.
- [ ] Cold-start after scale-to-zero: `custom_nodes`/`input`/`output`/`user` survive (Manager installs intact).

For a cheaper plumbing-only check, temporarily trim the template's `MODELS` list to one small
required file, verify build + web_server + URL, then restore the full list.

## 5. Persistence + reset checks (medium)

After a live deploy, verify the persistence layer:

- **Install a node via Manager**, generate output, upload an input → wait for scale-to-zero (idle
  timeout) or `modal app stop --yes` → wake the container → confirm the node/output/input are still there.
- **Reset custom_nodes** (Launch step) → wake the container → confirm Manager-installed nodes are
  gone but the image-baked baseline nodes returned (re-seed works).
- **Switch account** → confirm volume dirs wiped, new account's token active, models still cached.
