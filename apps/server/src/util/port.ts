import { createServer } from 'node:net';

/**
 * Find the first free port at or after `start`. Falls back to `start` (let the
 * caller's listen() surface the real error) if detection fails.
 */
export async function findFreePort(start: number, max = 50): Promise<number> {
  for (let offset = 0; offset < max; offset++) {
    const port = start + offset;
    if (await isFree(port)) return port;
  }
  return start;
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.unref();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}
