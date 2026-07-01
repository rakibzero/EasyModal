import type { LogEvent } from '@easymodal/shared';

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

export interface PublicAccount {
  id: string;
  label: string;
  modalTokenId: string;
  modalTokenSecretMasked: string;
  hasHuggingFace: boolean;
  createdAt: string;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  profile?: string;
  username?: string;
}

export const api = {
  health: () => getJson<{ status: string; time: string }>('/api/health'),
  prereqs: () => getJson<Prereqs>('/api/prereqs'),
  ping: () => postJson<{ ok: boolean }>('/api/ping', {}),
  listAccounts: () => getJson<{ accounts: PublicAccount[] }>('/api/accounts'),
  validateModal: (modalTokenId: string, modalTokenSecret: string) =>
    postJson<ValidationResult>('/api/accounts/validate', { modalTokenId, modalTokenSecret }),
  validateHf: (hfToken: string) => postJson<ValidationResult>('/api/accounts/validate-hf', { hfToken }),
  saveAccount: (body: {
    label?: string;
    modalTokenId: string;
    modalTokenSecret: string;
    huggingfaceToken?: string;
  }) => postJson<{ ok: boolean; account: PublicAccount; huggingface: ValidationResult }>('/api/accounts', body),
  deleteAccount: (id: string) =>
    fetch('/api/accounts/' + id, { method: 'DELETE' }).then((r) => r.json()),
  listWorkflows: () => getJson<{ categories: unknown[] }>('/api/workflows'),
  resetNodes: (instanceId: string) =>
    postJson<{ ok: boolean; output?: string; message?: string }>(
      `/api/instances/${instanceId}/reset-nodes`,
      {},
    ),
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
