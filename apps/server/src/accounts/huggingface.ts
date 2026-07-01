export interface HfValidation {
  ok: boolean;
  message: string;
  username?: string;
}

/**
 * Validate a HuggingFace token by calling the authenticated /api/whoami-v2
 * endpoint. A valid token returns 200 with the user's name; an invalid/gated
 * token returns 401.
 */
export async function validateHuggingFaceToken(token: string): Promise<HfValidation> {
  if (!token || !token.startsWith('hf_')) {
    return { ok: false, message: 'HuggingFace tokens start with "hf_".' };
  }
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) {
      return { ok: false, message: 'HuggingFace rejected this token (unauthorized).' };
    }
    if (!res.ok) {
      return { ok: false, message: `HuggingFace returned status ${res.status}.` };
    }
    const data = (await res.json()) as { name?: string; type?: string };
    if (data.type && data.type !== 'user') {
      return {
        ok: true,
        message: `Token is valid (type: ${data.type}). A "read" user token is recommended.`,
        username: data.name,
      };
    }
    return {
      ok: true,
      message: 'HuggingFace token is valid.',
      username: data.name,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Could not reach HuggingFace: ${msg.slice(0, 150)}` };
  }
}
