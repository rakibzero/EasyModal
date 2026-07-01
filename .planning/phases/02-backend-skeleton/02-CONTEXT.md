# Phase 2: Backend Skeleton - Context

**Gathered:** 2026-07-02
**Status:** Ready for execution
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

A local Fastify+TS server that boots on localhost, auto-picks a free port (default 7421), opens the default browser to the UI on boot, and exposes `/api/health`, `/api/prereqs` (Node version + modal CLI presence), and `/api/events` (SSE stream of LogEvents). Structured pino logging feeds the SSE bus.

</domain>

<decisions>
### Locked
- Fastify server on 127.0.0.1 only (never 0.0.0.0 — local-first security).
- Default port 7421; auto-increment if occupied until a free port is found.
- Browser auto-open on boot via `open` package; escape hatch `--no-open` / `NO_OPEN=1` env.
- SSE endpoint `GET /api/events` sends `text/event-stream`; heartbeats every 15s.
- Prereqs: detect Node version (process.versions) + whether `modal` CLI exists on PATH (via `which modal` / `where`).
- Event bus: a tiny in-process pub/sub holding recent buffer + live subscribers.

### Claude's Discretion
- Exact SSE message framing (default `data: {json}\n\n`).
- Buffer size for replay-on-connect (last N events).
- Whether to expose CORS (yes, for localhost dev only).
</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — BACK-01, BACK-02, BACK-03
- `.planning/ROADMAP.md` — Phase 2 success criteria
- `.planning/codebase/STACK.md` — existing Modal CLI at /home/rakib/.local/bin/modal
- `apps/server/src/main.ts` (Phase 1 starting point)
</canonical_refs>

<code_context>
Phase 1 created `apps/server/src/main.ts` with a basic Fastify server + `/api/health`. This phase extends it: add the event bus module, prereqs route, SSE route, port auto-pick, and browser-open. Refactor main.ts into modules (routes/, events/, prereqs/).
</code_context>
