import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StateCorruptError, StateStore } from './StateStore.js';
import type { SyncState } from './StateStore.js';

const STORE_MODULE = join(import.meta.dir, 'StateStore.ts');

test('a missing state.json loads as an empty state', async () => {
    const store = await newStore();

    const state = await store.load();

    expect(state.version).toBe(1);
    expect(state.documents).toEqual({});
    expect(state.initialPull).toEqual({ complete: false, position: null });
});

test('state and bases round-trip, and a deleted base reads as null', async () => {
    const store = await newStore();
    const state: SyncState = {
        ...(await store.load()),
        cursor: '2026-01-02T03:04:05.000Z',
        pendingCreates: { 'a/b.md': 'id-1' },
        events: [{ kind: 'recovered', path: 'a/b.md' }],
        toldSessions: { offline: ['s1'] },
        documents: {
            'id-1': {
                id: 'id-1',
                path: 'a/b.md',
                revision: 3,
                title: 'B',
                parentId: null,
                collectionId: 'c1',
                localHash: 'h',
                conflictRevision: 4,
            },
        },
    };

    await store.save(state);
    await store.writeBase('id-1', '# B\n');

    expect(await store.load()).toEqual(state);
    expect(await store.readBase('id-1')).toBe('# B\n');
    await store.deleteBase('id-1');
    expect(await store.readBase('id-1')).toBeNull();
});

test('a corrupt state.json throws a typed error and stays on disk untouched', async () => {
    const store = await newStore();
    const path = join(store.dir, 'state.json');
    const bad = ['{"version": 1, "documents": ', JSON.stringify({ version: 2 }), 'null'];
    await store.save(await store.load());

    for (const content of bad) {
        await writeFile(path, content);

        await expect(store.load()).rejects.toBeInstanceOf(StateCorruptError);
        expect(await readFile(path, 'utf8')).toBe(content);
    }
});

test('a process killed while saving never leaves a half-written state.json', async () => {
    const store = await newStore();
    await store.save(await store.load());
    const script = `
        import { StateStore } from ${JSON.stringify(STORE_MODULE)};
        const store = new StateStore(process.argv[1]);
        const state = await store.load();
        for (let i = 0; i < 4000; i++) {
            state.documents['id-' + i] = {
                id: 'id-' + i, path: 'folder/doc-' + i + '.md', revision: i, title: 'Document ' + i,
                parentId: null, collectionId: 'c', localHash: 'x'.repeat(32),
            };
        }
        console.log('ready');
        for (;;) { await store.save(state); await store.writeBase('id-1', 'x'.repeat(500000)); }
    `;

    for (let round = 0; round < 20; round++) {
        const child = Bun.spawn(['bun', '-e', script, store.dir], { stdout: 'pipe', stderr: 'inherit' });
        await child.stdout.getReader().read();
        await Bun.sleep(Math.random() * 40);
        child.kill('SIGKILL');
        await child.exited;

        const state = await store.load();
        const base = await store.readBase('id-1');

        expect(state.version).toBe(1);
        expect(base === null || base.length === 500000).toBe(true);
    }
});

test('a document id cannot escape the base folder', async () => {
    const store = await newStore();

    await expect(store.writeBase('../state', 'x')).rejects.toThrow('Not a document id');
});

async function newStore(): Promise<StateStore> {
    return new StateStore(join(await mkdtemp(join(tmpdir(), 'state-')), 'outline-sync'));
}
