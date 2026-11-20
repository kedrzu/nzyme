import { expect, test } from 'bun:test';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireLock, tryAcquireLock } from './lock.js';

const LOCK_MODULE = join(import.meta.dir, 'lock.ts');

test('two processes never hold the lock at once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lock-'));
    const lockPath = join(dir, 'lock');
    const logPath = join(dir, 'log');
    const script = `
        import { appendFileSync } from 'node:fs';
        import { acquireLock } from ${JSON.stringify(LOCK_MODULE)};
        const [lockPath, logPath] = process.argv.slice(1);
        for (let round = 0; round < 5; round++) {
            const lock = await acquireLock(lockPath, { timeoutMs: 30000 });
            if (!lock) throw new Error('timed out');
            appendFileSync(logPath, 'enter\\n');
            await new Promise(resolve => setTimeout(resolve, 5));
            appendFileSync(logPath, 'exit\\n');
            await lock.release();
        }
    `;
    await writeFile(logPath, '');

    const children = Array.from({ length: 6 }, () =>
        Bun.spawn(['bun', '-e', script, lockPath, logPath], { stdout: 'inherit', stderr: 'inherit' }),
    );
    const codes = await Promise.all(children.map(child => child.exited));

    const events = (await readFile(logPath, 'utf8')).trim().split('\n');
    expect(codes).toEqual(children.map(() => 0));
    // Every section is entered and left before the next one starts: a double hold would show "enter, enter".
    expect(events).toEqual(Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 'enter' : 'exit')));
});

test('a held lock blocks tryAcquire and acquire times out, until released', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    const held = await tryAcquireLock(lockPath);

    expect(held).not.toBeNull();
    expect(await tryAcquireLock(lockPath)).toBeNull();
    expect(await acquireLock(lockPath, { timeoutMs: 250 })).toBeNull();

    await held?.release();
    const next = await acquireLock(lockPath, { timeoutMs: 250 });
    expect(next).not.toBeNull();
    await next?.release();
});

test('acquire gets the lock when the holder releases during the wait', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    const held = await tryAcquireLock(lockPath);
    setTimeout(() => void held?.release(), 200);

    const next = await acquireLock(lockPath, { timeoutMs: 5000 });

    expect(next).not.toBeNull();
});

test('a lock whose process is dead is taken over', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    const child = Bun.spawn(['bun', '-e', '0']);
    await child.exited;
    await writeFile(lockPath, `${child.pid} ${Date.now()} dead`);

    const handle = await tryAcquireLock(lockPath);

    expect(handle).not.toBeNull();
});

test('a lock of a live process is kept for hours and taken over only after 24 hours', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    const hours = (count: number): number => count * 60 * 60 * 1000;

    await writeFile(lockPath, `${process.pid} ${Date.now() - hours(2)} live`);
    expect(await tryAcquireLock(lockPath)).toBeNull();

    await writeFile(lockPath, `${process.pid} ${Date.now() - hours(25)} recycled`);
    expect(await tryAcquireLock(lockPath)).not.toBeNull();
});

test('release leaves a lock that another process took over', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    const first = await tryAcquireLock(lockPath);
    await writeFile(lockPath, `${process.pid} ${Date.now() - 25 * 60 * 60 * 1000} stale`);
    const second = await tryAcquireLock(lockPath);
    expect(second).not.toBeNull();

    await first?.release();

    expect(await tryAcquireLock(lockPath)).toBeNull();
    await second?.release();
    expect(await tryAcquireLock(lockPath)).not.toBeNull();
});

test('an unreadable fresh lock file is treated as held, not stolen', async () => {
    const lockPath = join(await mkdtemp(join(tmpdir(), 'lock-')), 'lock');
    await appendFile(lockPath, '');

    expect(await tryAcquireLock(lockPath)).toBeNull();
});
