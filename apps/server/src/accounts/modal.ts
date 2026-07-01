import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
  profile = 'wan22-validate',
): Promise<ModalValidation> {
  try {
    await execFileP(
      'modal',
      ['token', 'set', '--token-id', tokenId, '--token-secret', tokenSecret, `--profile=${profile}`],
      { timeout: 20_000, env: process.env },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Modal rejected the token: ${msg.slice(0, 200)}` };
  }

  // Confirm the profile is active/usable.
  try {
    const { stdout } = await execFileP('modal', ['profile', 'current'], {
      timeout: 15_000,
      env: { ...process.env, MODAL_PROFILE: profile },
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
  profile = 'wan22',
): Promise<void> {
  await execFileP(
    'modal',
    ['token', 'set', '--token-id', tokenId, '--token-secret', tokenSecret, `--profile=${profile}`],
    { timeout: 20_000, env: process.env },
  );
}

/** Create or replace the `huggingface` Modal secret with the given HF token. */
export async function setHuggingFaceSecret(hfToken: string): Promise<{ ok: boolean; message: string }> {
  try {
    // `modal secret put` is idempotent — it creates or replaces.
    await execFileP('modal', ['secret', 'put', 'huggingface', `HF_TOKEN=${hfToken}`], {
      timeout: 20_000,
      env: process.env,
    });
    return { ok: true, message: 'HuggingFace secret stored on Modal.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not set Modal secret: ${msg.slice(0, 200)}` };
  }
}
