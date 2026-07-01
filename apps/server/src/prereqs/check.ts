import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface PrereqResult {
  nodeVersion: string;
  modalInstalled: boolean;
  modalPath: string | null;
  modalVersion: string | null;
  allOk: boolean;
}

/**
 * Detect whether prerequisites are satisfied: Node version + the `modal` CLI.
 * `modal` presence is checked by running `modal --version` (also captures the version).
 */
export async function checkPrereqs(): Promise<PrereqResult> {
  const nodeVersion = process.versions.node;

  let modalInstalled = false;
  let modalPath: string | null = null;
  let modalVersion: string | null = null;

  try {
    const { stdout, stderr } = await execFileP('modal', ['--version'], {
      timeout: 10_000,
      env: process.env,
    });
    const out = `${stdout}\n${stderr}`.trim();
    modalInstalled = true;
    // `modal --version` prints something like "Modal CLI version 0.x.y"
    const match = out.match(/(\d+\.\d+\.\d+)/);
    modalVersion = match ? match[1] : out.split('\n')[0] || null;
    try {
      const { stdout: whichOut } = await execFileP('which', ['modal'], { timeout: 5_000 });
      modalPath = whichOut.trim() || null;
    } catch {
      modalPath = null;
    }
  } catch {
    modalInstalled = false;
  }

  return {
    nodeVersion,
    modalInstalled,
    modalPath,
    modalVersion,
    allOk: modalInstalled,
  };
}
