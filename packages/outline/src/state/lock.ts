import { waitFor } from '@nzyme/utils/waitFor.js';
import { randomUUID } from 'node:crypto';
import { link, open, readFile, rename, rm, stat } from 'node:fs/promises';

/** A lock older than this belongs to a process that was killed without releasing it. */
const STALE_AFTER_MS = 10 * 60 * 1000;
const POLL_MS = 100;

export interface AcquireLockOptions {
    /** How long to keep polling a held lock before giving up. */
    timeoutMs: number;
}

/** A held lock. */
export interface LockHandle {
    /** Removes the lock file, but only when it still holds this handle's own claim. */
    release(): Promise<void>;
}

interface LockClaim {
    pid: number;
    /** Epoch milliseconds when the lock was taken. */
    takenAt: number;
}

/**
 * Takes the lock file at `path` unless another live process holds it. A lock is taken over when its
 * owner's pid is dead or it is older than 10 minutes. Returns `null` while the lock is held, so hooks
 * that must not wait (session start, prompt) skip the sync.
 */
export async function tryAcquireLock(path: string): Promise<LockHandle | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const handle = await createLock(path);
        if (handle) {
            return handle;
        }
        if (!(await removeIfStale(path))) {
            return null;
        }
    }
    return null;
}

/** Polls `tryAcquireLock` until it succeeds; `null` when `timeoutMs` passes first. */
export async function acquireLock(path: string, options: AcquireLockOptions): Promise<LockHandle | null> {
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
        const handle = await tryAcquireLock(path);
        if (handle) {
            return handle;
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await waitFor(POLL_MS);
    }
}

async function createLock(path: string): Promise<LockHandle | null> {
    // The nonce tells this claim from a later one taken by the same pid.
    const content = `${process.pid} ${Date.now()} ${randomUUID()}`;
    try {
        const file = await open(path, 'wx');
        try {
            await file.writeFile(content);
        } finally {
            await file.close();
        }
    } catch (error) {
        if (isErrno(error, 'EEXIST')) {
            return null;
        }
        throw error;
    }
    return {
        async release() {
            if ((await readText(path)) === content) {
                await rm(path, { force: true });
            }
        },
    };
}

/** True when the lock file is gone (removed now or by someone else) and creating it may be retried. */
async function removeIfStale(path: string): Promise<boolean> {
    const seen = await readText(path);
    if (seen === null) {
        return true;
    }
    if (!(await isStale(path, seen))) {
        return false;
    }
    // Moving the file aside lets this check that what was removed is what was judged stale: another
    // process may have taken the lock over in between, and its fresh lock must not be destroyed.
    const aside = `${path}.${process.pid}.${randomUUID()}.stale`;
    try {
        await rename(path, aside);
    } catch (error) {
        if (isErrno(error, 'ENOENT')) {
            return true;
        }
        throw error;
    }
    if ((await readText(aside)) !== seen) {
        // Took a live lock by mistake: put it back unless someone has created a new one already.
        await restore(aside, path);
        return false;
    }
    await rm(aside, { force: true });
    return true;
}

async function restore(aside: string, path: string): Promise<void> {
    try {
        await link(aside, path);
    } catch (error) {
        if (!isErrno(error, 'EEXIST')) {
            throw error;
        }
    }
    await rm(aside, { force: true });
}

async function isStale(path: string, text: string): Promise<boolean> {
    const claim = parseClaim(text);
    if (claim) {
        return Date.now() - claim.takenAt > STALE_AFTER_MS || !isAlive(claim.pid);
    }
    // Content not written yet (the owner is between creating the file and writing it), or garbage.
    try {
        return Date.now() - (await stat(path)).mtimeMs > STALE_AFTER_MS;
    } catch (error) {
        if (isErrno(error, 'ENOENT')) {
            return false;
        }
        throw error;
    }
}

function parseClaim(text: string): LockClaim | null {
    const [pid, takenAt] = text.split(' ').map(Number);
    if (pid == null || takenAt == null || !Number.isInteger(pid) || !Number.isFinite(takenAt)) {
        return null;
    }
    return { pid, takenAt };
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process exists but belongs to someone else.
        return !isErrno(error, 'ESRCH');
    }
}

async function readText(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (isErrno(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

function isErrno(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}
