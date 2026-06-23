import { execFileSync } from 'node:child_process';

import { lsofListenArgs } from './lsofListenArgs.js';

/**
 * Synchronously check whether a TCP port already has a listener.
 *
 * Evaluated at Playwright config-load time — before the e2e webServer is (re)started — to decide
 * whether a full app stack was already running locally. Uses `lsof` (matching the rest of the
 * worktree port tooling) and is synchronous on purpose: the Playwright config module is evaluated
 * synchronously and there is no app stack to start until that resolves.
 *
 * @returns `true` if at least one process is listening on the port; `false` otherwise. lsof exits
 * non-zero with no output when nothing is listening; if lsof is unavailable, `execFileSync` throws
 * `ENOENT` (the process never runs, so there is no exit code) — both cases are caught and return
 * `false`.
 */
export function isPortListening(port: number): boolean {
    try {
        const stdout = execFileSync('lsof', lsofListenArgs(port), {
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return stdout.toString().trim().length > 0;
    } catch {
        return false;
    }
}
