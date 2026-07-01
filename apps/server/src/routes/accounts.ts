import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  listAccounts,
  saveAccount,
  deleteAccount,
  getAccount,
} from '../repo/configStore.js';
import { validateModalToken, persistModalToken, setHuggingFaceSecret } from '../accounts/modal.js';
import { validateHuggingFaceToken } from '../accounts/huggingface.js';
import { bus } from '../events/bus.js';

/** Mask a token for API responses — never return full secrets to the UI. */
function mask(secret: string): string {
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function publicAccount(a: ReturnType<typeof getAccount> & {}) {
  return {
    id: a.id,
    label: a.label,
    modalTokenId: a.modalTokenId,
    modalTokenSecretMasked: mask(a.modalTokenSecret),
    hasHuggingFace: !!a.huggingfaceToken,
    createdAt: a.createdAt,
  };
}

interface CreateBody {
  label?: string;
  modalTokenId: string;
  modalTokenSecret: string;
  huggingfaceToken?: string;
}

interface ValidateBody {
  modalTokenId: string;
  modalTokenSecret: string;
}

interface HfBody {
  hfToken: string;
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/accounts', async () => {
    return { accounts: listAccounts().map(publicAccount) };
  });

  /** Validate (without saving) — Modal + optional HF. */
  app.post('/api/accounts/validate', async (req, reply) => {
    const { modalTokenId, modalTokenSecret } = req.body as ValidateBody;
    if (!modalTokenId || !modalTokenSecret) {
      return reply.code(400).send({ ok: false, message: 'Modal token id and secret are required.' });
    }
    const modal = await validateModalToken(modalTokenId, modalTokenSecret);
    return modal;
  });

  app.post('/api/accounts/validate-hf', async (req, reply) => {
    const { hfToken } = req.body as HfBody;
    if (!hfToken) return reply.code(400).send({ ok: false, message: 'hfToken is required.' });
    return validateHuggingFaceToken(hfToken);
  });

  /** Create/save an account: validates, persists Modal token, sets HF secret. */
  app.post('/api/accounts', async (req, reply) => {
    const body = req.body as CreateBody;
    if (!body.modalTokenId || !body.modalTokenSecret) {
      return reply.code(400).send({ ok: false, message: 'Modal token id and secret are required.' });
    }

    bus.info(`Validating Modal token for "${body.label || 'account'}"…`);
    const modal = await validateModalToken(body.modalTokenId, body.modalTokenSecret);
    if (!modal.ok) {
      bus.info(`Modal token invalid: ${modal.message}`, { level: 'error' });
      return reply.code(400).send({ ok: false, message: modal.message });
    }

    // Persist the token under the real profile.
    await persistModalToken(body.modalTokenId, body.modalTokenSecret);
    bus.info('Modal token accepted and persisted.');

    let hfOk = true;
    let hfMessage = 'No HuggingFace token provided.';
    if (body.huggingfaceToken) {
      const hf = await validateHuggingFaceToken(body.huggingfaceToken);
      if (!hf.ok) {
        hfOk = false;
        hfMessage = hf.message;
        bus.info(`HuggingFace token invalid: ${hf.message}`, { level: 'warn' });
      } else {
        const secret = await setHuggingFaceSecret(body.huggingfaceToken);
        hfOk = secret.ok;
        hfMessage = secret.message;
        bus.info(`HuggingFace: ${hfMessage}`);
      }
    }

    const account = {
      id: randomUUID(),
      label: body.label || 'My Modal Account',
      modalTokenId: body.modalTokenId,
      modalTokenSecret: body.modalTokenSecret,
      huggingfaceToken: body.huggingfaceToken,
      createdAt: new Date().toISOString(),
    };
    saveAccount(account);
    bus.info(`Account "${account.label}" saved.`, { level: 'success' });

    return reply.code(201).send({
      ok: true,
      account: publicAccount(account),
      modal: { ok: true, profile: modal.profile },
      huggingface: { ok: hfOk, message: hfMessage },
    });
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = deleteAccount(id);
    if (!removed) return reply.code(404).send({ ok: false, message: 'Account not found.' });
    bus.info(`Account ${id} removed.`);
    return { ok: true };
  });

  /** Re-set the HuggingFace Modal secret for an existing account. */
  app.post('/api/accounts/:id/modal-secret', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { hfToken } = req.body as HfBody;
    const account = getAccount(id);
    if (!account) return reply.code(404).send({ ok: false, message: 'Account not found.' });
    const token = hfToken || account.huggingfaceToken;
    if (!token) return reply.code(400).send({ ok: false, message: 'No HuggingFace token to set.' });
    const result = await setHuggingFaceSecret(token);
    return reply.code(result.ok ? 200 : 400).send(result);
  });
}
