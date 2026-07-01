import type { LogEvent } from '@wan22/shared';

// In dev, Vite proxies /api to the backend. In production the server serves
// the built bundle, so relative /api paths resolve to the same origin.
const BASE = '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return (await res.json()) as T;
}

export interface Prereqs {
  nodeVersion: string;
  modalInstalled: boolean;
  modalPath: string | null;
  modalVersion: string | null;
  allOk: boolean;
}

export const api = {
  health: () => getJson<{ status: string; time: string }>('/api/health'),
  prereqs: () => getJson<Prereqs>('/api/prereqs'),
  ping: () => postJson<{ ok: boolean }>('/api/ping', {}),
};

/** Subscribe to the SSE event stream. Returns an unsubscribe function. */
export function subscribeEvents(onEvent: (e: LogEvent) => void): () => void {
  const es = new EventSource('/api/events');
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}
