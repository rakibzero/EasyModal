# Wan2.2Animate Deploy — Production Plan

**An open-source web app to deploy ComfyUI on Modal with zero pain.**
**Created:** 2026-07-01 · **Status:** Executing (autonomous)

---

## 0. Product thesis (the README's first line)

> **Modal is powerful but miserable to set up. This is the missing UI.**
> Paste your Modal key + HuggingFace token. Click deploy. Get a working ComfyUI URL. That's it.

Everything in this plan serves that sentence.

## 1. Vision & future roadmap (so today's design doesn't block tomorrow)

You named three future directions — they shape today's data model:

1. **Multiple Modal accounts** → model accounts as first-class entities now.
2. **Manage multiple instances** → model instances (deployments) as entities linked to accounts.
3. **Model nodes & workflows management** → model a "library" of deployable configs (model sets, custom-node sets, workflows) as entities.

**Today's v1 ships single-account, single-instance** — but the schema, API routes, and UI are built around these entities so v2 is additive, not a rewrite.

## 2. Architecture

```
┌─────────────── End user's machine ───────────────┐
│                                                   │
│  Browser ──► React+Vite+TS+Tailwind UI (localhost)│
│                  │  REST + SSE                    │
│                  ▼                                │
│         Fastify+TS local backend                  │
│            ├─ encrypted key store                 │
│            ├─ accounts/instances repos            │
│            ├─ shells to `modal` CLI               │
│            └─ SSE log streams                     │
│                                                   │
└──────────────────┬────────────────────────────────┘
                   │ modal deploy / run / secrets
                   ▼
┌────────────── Modal Cloud (per user account) ────┐
│  bundled comfyapp.py  →  app + Volume + Secret   │
│        └─ HTTPS URL (the link we hand back)      │
└───────────────────────────────────────────────────┘
```

**Two runtimes (unchanged principle):**
- **App** = local, lightweight, no GPU. Orchestration + UX + secret custody.
- **Compute** = user's Modal account. We never touch their compute directly.

## 3. Repository structure (monorepo)

```
wan22-animate/
├── package.json                  # workspace root (npm workspaces)
├── pnpm-workspace.yaml or workspaces
├── README.md  LICENSE  .gitignore
│
├── apps/
│   ├── web/                      # React + Vite + TS + Tailwind frontend
│   │   ├── src/
│   │   │   ├── pages/            # Setup, Keys, Deploy, Instances, Launch
│   │   │   ├── components/       # LogStream, StatusDot, KeyInput, InstanceCard…
│   │   │   ├── api/              # typed client for backend
│   │   │   └── store/            # state (accounts/instances)
│   │   └── vite.config.ts        # dev proxy → backend
│   │
│   └── server/                   # Fastify + TS backend
│       ├── src/
│       │   ├── routes/           # accounts, instances, deploy, logs(SSE), config
│       │   ├── modal/            # CLI wrapper (deploy/run/secrets/status)
│       │   ├── secrets/          # encrypted store (AES-GCM, machine key)
│       │   ├── repo/             # accounts/instances/libraries (JSON DB now, swappable)
│       │   ├── events/           # SSE log/event bus
│       │   └── main.ts           # boot, open browser
│       └── templates/
│           └── comfyapp.py.tpl   # ★ the clean bundled ComfyUI-on-Modal template
│
├── packages/
│   └── shared/                   # TS types shared web↔server (Account, Instance…)
│
└── .planning/                    # this plan + codebase map
```

## 4. The clean `comfyapp.py` template (the product's heart)

Refactored from [comfyapp.py](comfyapp.py) per [CONCERNS.md](codebase/CONCERNS.md). Fixes:
1. **Loud failures** — `download_models()` returns `{ok, failed[], skipped[]}`; deploy fails if any *required* model fails (optional → warn).
2. **`CONFIG` dict at top** — GPU, `max_inputs` (default **2**, not 50 — avoids OOM), timeouts, app name, model list. Backend injects user choices at deploy.
3. **Model list is data-driven** — a single `MODELS: list[ModelSpec]` table drives both download + the coverage checker.
4. **Coverage checker** — parses `workflows/*.json`, reports referenced-but-undownloaded models. Powers the Verify step.
5. **Idempotent** hard-link placement preserved (the part that already works).

## 5. Data model (multi-account-ready from day 1)

```ts
Account   { id, label, modalTokenId, modalTokenSecret(enc), createdAt }
Instance  { id, accountId, name, status, modalUrl?, config, lastDeployedAt? }
Library   { id, type: 'modelSet'|'nodeSet'|'workflow', name, spec }   // v2
```
v1 UI shows one account + one instance; the schema already supports N of each.

## 6. Phased roadmap

| Phase | Delivers | Verify gate |
|-------|----------|-------------|
| **1. Scaffold** | Monorepo, web+server apps, `dev` boots both, blank UI reachable | Browser opens, hot-reload works |
| **2. Keys** | Encrypted key store; "paste Modal + HF → test → save"; `modal token set` + secret creation | Valid keys accepted; invalid rejected w/ message |
| **3. Deploy** | Bundled clean `comfyapp.py`; "Deploy" runs `modal deploy`, streams logs via SSE; surfaces failures loudly | Real deploy streams; failure → red+retry; success → instance status=ready |
| **4. Launch** | Instance list; fetch Modal URL; "Open ComfyUI" button; resumable status | End-to-end: keys → deploy → clickable ComfyUI link |
| **5. Ship** | README, LICENSE (MIT), one-command start (`npx wan22-deploy`), build/pack, basic tests | Fresh-clone smoke test passes |

Future (not in v1): multi-account switcher, multi-instance panel, model/node/workflow library browser, deploy presets.

## 7. v1 scope — explicit boundaries

**In:** single account, single instance, key custody, deploy, live logs, status, link, one-command start, open-source packaging.
**Out (deferred):** multi-account UI, multi-instance mgmt, workflow/model library UI, endpoint auth, custom-node SHA pinning, hosted version.

## 8. Assumptions (autonomous — override anytime)
1. MIT license (most permissive, best for OSS adoption).
2. npm workspaces (not pnpm/yarn) for lowest friction — zero extra install for contributors.
3. JSON-file local DB now (swappable for SQLite later) — keeps v1 dependency-free.
4. Launcher opens `127.0.0.1:PORT` and auto-opens the browser.
5. `modal` CLI must be installed by the user (we detect + guide, don't bundle).

---
*Executing Phase 1 now. I'll report at each verify gate.*
