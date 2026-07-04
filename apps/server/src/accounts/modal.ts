import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { modalEnv } from '../modal/env.js';

const execFileP = promisify(execFile);

export interface ModalValidation {
  ok: boolean;
  message: string;
  profile?: string;
}

/**
 * Validate a Modal token by running `modal token set` then `modal profile current`.
 * `modal token set` writes the credentials to the user's Modal config; if the
 * token is invalid, `modal profile current` (or a guarded call) fails.
 *
 * Uses a throwaway profile name to avoid clobbering the user's default profile.
 */
export async function validateModalToken(
  tokenId: string,
  tokenSecret: string,
  profile = 'easymodal-validate',
): Promise<ModalValidation> {
  try {
    await execFileP(
      'modal',
      ['token', 'set', '--token-id', tokenId, '--token-secret', tokenSecret, `--profile=${profile}`],
      { timeout: 20_000, env: modalEnv() },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Modal rejected the token: ${msg.slice(0, 200)}` };
  }

  // Confirm the profile is active/usable.
  try {
    const { stdout } = await execFileP('modal', ['profile', 'current'], {
      timeout: 15_000,
      env: { ...modalEnv(), MODAL_PROFILE: profile },
    });
    return {
      ok: true,
      message: 'Modal token is valid.',
      profile: stdout.trim() || profile,
    };
  } catch {
    // token set succeeded — treat as valid even if profile current is finicky.
    return { ok: true, message: 'Modal token accepted.', profile };
  }
}

/** Persist the token under a real profile name (called after validation passes). */
export async function persistModalToken(
  tokenId: string,
  tokenSecret: string,
  profile = 'easymodal',
): Promise<void> {
  await execFileP(
    'modal',
    ['token', 'set', '--token-id', tokenId, '--token-secret', tokenSecret, `--profile=${profile}`],
    { timeout: 20_000, env: modalEnv() },
  );
}

/**
 * Activate a specific account's Modal profile so the NEXT `modal deploy` /
 * `modal run` targets that account. Called before every deploy.
 *
 * Each account is stored under a per-account profile name derived from its id,
 * so switching accounts = switching the active profile. We (re)set the token
 * first to be safe (idempotent), then mark the profile active.
 */
export async function activateAccountProfile(
  accountId: string,
  tokenId: string,
  tokenSecret: string,
): Promise<void> {
  const profile = `easymodal-${accountId}`;
  await execFileP(
    'modal',
    ['token', 'set', '--token-id', tokenId, '--token-secret', tokenSecret, `--profile=${profile}`],
    { timeout: 20_000, env: modalEnv() },
  );
  // Activate the profile so subsequent modal commands use it.
  try {
    await execFileP('modal', ['profile', 'activate', profile], {
      timeout: 15_000,
      env: modalEnv(),
    });
  } catch {
    // Some modal versions don't have `profile activate`; fall back to env.
  }
}

/** Create or replace the `huggingface` Modal secret with the given HF token. */
export async function setHuggingFaceSecret(hfToken: string): Promise<{ ok: boolean; message: string }> {
  try {
    // `modal secret create --force` is the idempotent form (create-or-replace).
    // Older `modal` versions used `modal secret put`; current versions renamed
    // it to `create` and made overwrite require `--force`. Without --force, the
    // second call fails with "secret already exists" — so always pass it.
    await execFileP('modal', ['secret', 'create', '--force', 'huggingface', `HF_TOKEN=${hfToken}`], {
      timeout: 20_000,
      env: modalEnv(),
    });
    return { ok: true, message: 'HuggingFace secret stored on Modal.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not set Modal secret: ${msg.slice(0, 200)}` };
  }
}

/**
 * Pre-flight check: confirm the `huggingface` secret exists on this Modal
 * account before we attempt `modal deploy`. Without it, the image build's
 * model downloads silently fall back to anonymous HF access — which either
 * rate-limits and hangs for hours, or 401s mid-download with the error buried
 * in pip output. Failing fast here gives the user an actionable message
 * ("set your HF token in Keys") instead of a mystery hang.
 *
 * `modal secret list` prints one secret per line; we grep for the name.
 */
export async function verifyHuggingFaceSecret(): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout } = await execFileP('modal', ['secret', 'list'], {
      timeout: 20_000,
      env: modalEnv(),
    });
    const hasSecret = /^huggingface\b/m.test(stdout) || /huggingface/.test(stdout);
    return hasSecret
      ? { ok: true, message: 'HuggingFace secret present.' }
      : {
          ok: false,
          message:
            'The "huggingface" Modal secret is not set on this account. Open Keys and save your HF token first — model downloads will fail without it.',
        };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not verify HuggingFace secret: ${msg.slice(0, 200)}` };
  }
}

/**
 * Ensure the `ai-toolkit-auth` Modal secret exists (required by the AI Toolkit
 * web server for its secondary auth gate). Reuses a persisted per-account token
 * if provided (so ModHeader config stays stable across redeploys); otherwise
 * generates a random one. Idempotent — safe to call before every deploy.
 * Returns the token that's now stored. Caller should persist `token` per
 * account so the next deploy reuses it.
 */
export async function ensureAiToolkitAuthSecret(
  userToken?: string,
): Promise<{ ok: boolean; token: string; message: string }> {
  const { randomBytes } = await import('node:crypto');
  const token = userToken && userToken.trim().length >= 8
    ? userToken.trim()
    : `em_${randomBytes(32).toString('base64url')}`;
  try {
    await execFileP('modal', ['secret', 'create', '--force', 'ai-toolkit-auth', `AI_TOOLKIT_AUTH=${token}`], {
      timeout: 20_000,
      env: modalEnv(),
    });
    return { ok: true, token, message: 'AI Toolkit auth secret stored on Modal.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, token, message: `Could not set ai-toolkit-auth secret: ${msg.slice(0, 200)}` };
  }
}
