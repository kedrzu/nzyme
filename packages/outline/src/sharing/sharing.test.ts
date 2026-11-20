import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakeOutline } from '../outline/fakeOutline.js';
import type { FakeOutline } from '../outline/fakeOutline.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { pull } from '../reconcile/pull.js';
import { push } from '../reconcile/push.js';
import { StateStore } from '../state/StateStore.js';
import { syncSharing } from './sharing.js';
import type { SharingOptions } from './sharing.js';

const TEXT = 'First paragraph.\n\nSecond paragraph.';

test('adding names to the list gives those users and groups access, removing a name takes it away', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn();
    for (const user of [world.bob, world.carol, world.dave]) {
        await expect(world.outline.clientAs(user).documents.info({ id: doc.id })).rejects.toMatchObject({
            status: 403,
        });
    }

    // A full name in any case, an e-mail, and a group: all three kinds of entry.
    await world.setShared(doc, ['bob', 'Carol@Example.test', 'Marketing']);
    const report = await world.turn();

    for (const user of [world.bob, world.carol, world.dave]) {
        expect((await world.outline.clientAs(user).documents.info({ id: doc.id })).title).toBe('Plan');
    }
    expect(await world.read(doc)).toBe(
        `---\noutline: ${doc.id}\nshared: [Bob, Carol, Marketing]\n---\n# Plan\n\n${TEXT}`,
    );
    expect(report.written).toMatchObject([{ path: 'ana-private/plan.md' }]);
    expect((await world.state()).documents[doc.id]?.shared).toEqual(['Bob', 'Carol', 'Marketing']);
    const shares = await world.memberships(doc);
    expect([...shares.users, ...shares.groups].map(share => share.permission)).toEqual([
        'read_write',
        'read_write',
        'read_write',
    ]);

    await world.setShared(doc, ['Carol', 'Marketing']);
    await world.turn();

    await expect(world.outline.clientAs(world.bob).documents.info({ id: doc.id })).rejects.toMatchObject({
        status: 403,
    });
    expect((await world.outline.clientAs(world.carol).documents.info({ id: doc.id })).title).toBe('Plan');
    expect(await world.read(doc)).toContain('shared: [Carol, Marketing]');

    await world.setShared(doc, ['Carol']);
    await world.turn();
    await expect(world.outline.clientAs(world.dave).documents.info({ id: doc.id })).rejects.toMatchObject({
        status: 403,
    });
});

test('after a sync the list is exactly what Outline holds: the file writes names, in a stable order, and a second sync changes nothing', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn();
    await world.setShared(doc, ['Marketing', 'dave@example.test', 'Carol']);
    await world.turn();
    const settled = await world.read(doc);
    expect(settled).toContain('shared: [Carol, Dave, Marketing]');
    const stateBefore = await readFile(join(world.store.dir, 'state.json'), 'utf8');
    const requestsBefore = world.outline.requests.length;

    const report = await world.turn();

    expect(await world.read(doc)).toBe(settled);
    expect(report.written).toEqual([]);
    expect(report.rejected).toEqual([]);
    expect(await readFile(join(world.store.dir, 'state.json'), 'utf8')).toBe(stateBefore);
    expect(world.outline.requests.slice(requestsBefore).filter(request => request.method.includes('add_'))).toEqual([]);
});

test('a user whose name another user has is listed by e-mail, and the e-mail finds the right one', async () => {
    const world = await setup();
    const first = world.outline.addUser({ name: 'Sam Lee', email: 'sam.first@example.test' });
    world.outline.addUser({ name: 'Sam Lee', email: 'sam.second@example.test' });
    const doc = world.addPrivateDocument('Plan');
    await world.turn();

    await world.setShared(doc, ['Sam Lee']);
    const ambiguous = await world.turn();
    expect(ambiguous.unresolved).toMatchObject([{ path: 'ana-private/plan.md', entry: 'Sam Lee' }]);
    expect(await world.memberships(doc)).toEqual({ users: [], groups: [] });

    await world.setShared(doc, ['SAM.FIRST@example.test']);
    await world.turn();

    expect(await world.read(doc)).toContain('shared: [sam.first@example.test]');
    expect((await world.outline.clientAs(first).documents.info({ id: doc.id })).title).toBe('Plan');
});

test('a frontmatter-only edit sends no content update', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn();
    const revision = world.outline.getDocument(doc.id)?.revision;

    await world.setShared(doc, ['Bob']);
    await world.turn();

    expect(world.outline.getDocument(doc.id)?.revision).toBe(revision);
    expect(world.calls('documents.update')).toBe(0);
});

test('an entry that matches nobody never blocks the content push, stays in the file and is reported every run', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn();

    await world.write(doc, `---\noutline: ${doc.id}\nshared: [Bob, Nobody Here]\n---\n# Plan\n\nEdited text.`);
    const first = await world.turn();

    expect(world.outline.getDocument(doc.id)?.text).toBe('Edited text.');
    expect((await world.outline.clientAs(world.bob).documents.info({ id: doc.id })).title).toBe('Plan');
    expect(await world.read(doc)).toContain('shared: [Bob, Nobody Here]');
    expect(first.unresolved).toMatchObject([{ entry: 'Nobody Here' }]);
    expect((await world.state()).documents[doc.id]?.sharing?.unresolved).toEqual(['Nobody Here']);
    expect(first.rejected).toEqual([]);

    const second = await world.turn();
    expect(second.unresolved).toMatchObject([{ entry: 'Nobody Here' }]);
    expect(await world.read(doc)).toContain('shared: [Bob, Nobody Here]');
});

test('an unresolved entry survives a later edit made in Outline, and resolves once the user exists', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn();
    await world.setShared(doc, ['Erin Late']);
    await world.turn();

    await world.edit(doc, 'First paragraph.\n\nChanged in Outline.');
    const report = await world.turn();
    expect(report.unresolved).toMatchObject([{ entry: 'Erin Late' }]);
    expect(await world.read(doc)).toBe(
        `---\noutline: ${doc.id}\nshared: [Erin Late]\n---\n# Plan\n\nFirst paragraph.\n\nChanged in Outline.`,
    );

    const erin = world.outline.addUser({ name: 'Erin Late' });
    const resolved = await world.turn();
    expect(resolved.unresolved).toEqual([]);
    expect(await world.read(doc)).toContain('shared: [Erin Late]');
    expect((await world.state()).documents[doc.id]?.sharing?.unresolved).toEqual([]);
    expect((await world.outline.clientAs(erin).documents.info({ id: doc.id })).title).toBe('Plan');
});

test('a change Outline refuses is reported once and the list goes back to Outline', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    world.outline.shareDocument({ document: doc, user: world.dave, permission: 'read' });
    await world.turn('full');
    expect(await world.read(doc)).toContain('shared: [Dave]');

    // Sharing a document with oneself is refused by Outline.
    await world.setShared(doc, ['Dave', 'Ana']);
    const refused = await world.turn();

    expect(refused.rejected).toMatchObject([{ path: 'ana-private/plan.md', entry: 'Ana' }]);
    expect((await world.state()).events).toMatchObject([
        { kind: 'share-rejected', path: 'ana-private/plan.md', email: 'Ana' },
    ]);
    expect(await world.read(doc)).toContain('shared: [Dave]');
    expect(await world.read(doc)).not.toContain('Ana');

    const again = await world.turn();
    expect(again.rejected).toEqual([]);
    expect((await world.state()).events).toHaveLength(1);
});

test('without the right to manage the document, a list edit is refused once and reverted', async () => {
    const world = await setup();
    const reference = world.outline.addCollection({ name: 'Reference', permission: 'read' });
    const doc = world.outline.addDocument({ collection: reference, title: 'Rules', text: TEXT, createdBy: world.bob });
    world.track(doc, 'reference/rules.md');
    await world.turn('full');

    await world.setShared(doc, ['Carol']);
    const refused = await world.turn();

    expect(refused.rejected).toMatchObject([{ entry: 'Carol' }]);
    expect(await world.read(doc)).toBe(`---\noutline: ${doc.id}\n---\n# Rules\n\n${TEXT}`);
    expect(world.outline.requests.filter(request => request.method === 'documents.add_user')).toEqual([]);

    await world.turn();
    expect((await world.state()).events).toHaveLength(1);
});

test('a full pass writes a list changed in Outline into the file and does not push it as a content change', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn('full');

    world.outline.shareDocument({ document: doc, user: world.carol, permission: 'read' });
    world.outline.shareDocument({ document: doc, group: world.team, permission: 'read' });
    await world.turn('incremental');
    expect(await world.read(doc)).not.toContain('shared');

    const report = await world.turn('full');

    expect(await world.read(doc)).toBe(`---\noutline: ${doc.id}\nshared: [Carol, Marketing]\n---\n# Plan\n\n${TEXT}`);
    expect(report.written).toMatchObject([{ added: ['Carol', 'Marketing'], removed: [] }]);
    expect((await world.state()).documents[doc.id]?.shared).toEqual(['Carol', 'Marketing']);
    expect(await world.store.readBase(doc.id)).toContain('shared: [Carol, Marketing]');
    expect(world.calls('documents.update')).toBe(0);
    expect((await world.push()).updated).toEqual([]);

    await world.outline.clientAs(world.ana).documents.removeUser({ id: doc.id, userId: world.carol.id });
    await world.turn('full');
    expect(await world.read(doc)).toContain('shared: [Marketing]');
    expect(world.calls('documents.update')).toBe(0);
});

test('a list rewrite from Outline keeps an unsent text edit as an edit', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn('full');
    const path = join(world.documentsDir, 'ana-private/plan.md');
    await writeFile(path, `---\noutline: ${doc.id}\n---\n# Plan\n\nMy unsent edit.`);
    world.outline.shareDocument({ document: doc, user: world.carol, permission: 'read' });

    await world.sharing('full');
    expect(await world.read(doc)).toBe(`---\noutline: ${doc.id}\nshared: [Carol]\n---\n# Plan\n\nMy unsent edit.`);
    const pushed = await world.push();

    expect(pushed.updated).toEqual(['ana-private/plan.md']);
    expect(world.outline.getDocument(doc.id)?.text).toBe('My unsent edit.');
});

test('edited in the file and in Outline at once: the file edit is applied, Outline wins the rest and it is reported', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    await world.turn('full');
    world.outline.shareDocument({ document: doc, user: world.carol, permission: 'read' });

    await world.setShared(doc, ['Bob']);
    const report = await world.turn();

    expect(await world.read(doc)).toContain('shared: [Bob, Carol]');
    expect(report.outlineWon).toEqual([{ path: 'ana-private/plan.md', added: ['Carol'], removed: [] }]);
    expect((await world.outline.clientAs(world.bob).documents.info({ id: doc.id })).title).toBe('Plan');
});

test('a file with invalid frontmatter or conflict markers is never read as an empty list', async () => {
    const world = await setup();
    const doc = world.addPrivateDocument('Plan');
    world.outline.shareDocument({ document: doc, user: world.bob, permission: 'read' });
    await world.turn('full');

    await world.write(doc, `---\noutline: ${doc.id}\nshared: [Bob\n---\n# Plan\n\n${TEXT}`);
    const report = await world.turn();

    expect(report.skipped).toMatchObject([{ path: 'ana-private/plan.md' }]);
    expect((await world.outline.clientAs(world.bob).documents.info({ id: doc.id })).title).toBe('Plan');
});

test('a full pass fetches Outline lists for a bounded number of documents and covers them all over several passes', async () => {
    const world = await setup();
    for (let index = 1; index <= 5; index++) {
        world.addPrivateDocument(`Doc ${index}`);
    }
    await world.pull('full');
    const fetched = () => world.calls('documents.memberships');

    const first = await world.sharing('full', 2);
    expect([first.checked, fetched()]).toEqual([2, 2]);
    await world.sharing('full', 2);
    await world.sharing('full', 2);
    const checkedAt = Object.values((await world.state()).documents).map(document => document.sharing?.checkedAt);

    expect(fetched()).toBe(6);
    expect(checkedAt.every(value => value != null)).toBe(true);
    // An incremental pass fetches nothing when no list was edited.
    await world.sharing('incremental', 2);
    expect(fetched()).toBe(6);
});

test('documents with a list are checked before the rest when the budget is short', async () => {
    const world = await setup();
    const listed = world.addPrivateDocument('Listed');
    world.outline.shareDocument({ document: listed, user: world.bob, permission: 'read' });
    for (let index = 1; index <= 4; index++) {
        world.addPrivateDocument(`Other ${index}`);
    }
    await world.pull('full');
    await world.sharing('full', 100);
    world.outline.shareDocument({ document: listed, user: world.carol, permission: 'read' });

    await world.sharing('full', 2);

    expect(await world.read(listed)).toContain('shared: [Bob, Carol]');
});

async function setup() {
    const outline: FakeOutline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const carol = outline.addUser({ name: 'Carol' });
    const dave = outline.addUser({ name: 'Dave' });
    const team = outline.addGroup({ name: 'Marketing', members: [dave] });
    const mine = outline.addCollection({ name: 'Ana private', members: [{ user: ana, permission: 'admin' }] });
    const root = await mkdtemp(join(tmpdir(), 'sharing-'));
    const store = new StateStore(join(root, 'state'));
    const documentsDir = join(root, 'docs');
    const recoveredDir = join(root, 'recovered');
    const paths = new Map<string, string>();

    const world = {
        outline,
        ana,
        bob,
        carol,
        dave,
        team,
        store,
        documentsDir,
        addPrivateDocument: (title: string) => {
            const document = outline.addDocument({ collection: mine, title, text: TEXT, createdBy: ana });
            paths.set(document.id, `ana-private/${title.toLowerCase().replaceAll(' ', '-')}.md`);
            return document;
        },
        track: (document: OutlineDocument, path: string) => paths.set(document.id, path),
        state: () => store.load(),
        read: (document: OutlineDocument) => readFile(join(documentsDir, pathOf(document)), 'utf8'),
        write: async (document: OutlineDocument, content: string) => {
            const path = join(documentsDir, pathOf(document));
            await mkdir(join(path, '..'), { recursive: true });
            await writeFile(path, content);
        },
        /** The file as the user edits it: only the `shared:` line changes. */
        setShared: async (document: OutlineDocument, entries: string[]) => {
            const current = await world.read(document);
            const body = current.replace(/^---\n[\s\S]*?\n---\n/, '');
            await world.write(document, `---\noutline: ${document.id}\nshared: [${entries.join(', ')}]\n---\n${body}`);
        },
        /** Someone else's edit of the document text. */
        edit: (document: OutlineDocument, text: string) =>
            outline.clientAs(ana).documents.update({ id: document.id, text }),
        memberships: async (document: OutlineDocument) => {
            const client = outline.clientAs(ana);
            return {
                users: (await client.documents.memberships({ id: document.id })).memberships,
                groups: (await client.documents.groupMemberships({ id: document.id })).groupMemberships,
            };
        },
        /** How many `method` calls Ana's sync made. */
        calls: (method: string) =>
            outline.requests.filter(request => request.method === method && request.userId === ana.id).length,
        pull: async (mode: 'incremental' | 'full' = 'incremental') =>
            pull({
                client: outline.clientAs(ana),
                store,
                state: await store.load(),
                documentsDir,
                recoveredDir,
                mode,
                deadline: Number.POSITIVE_INFINITY,
            }),
        push: async () =>
            push({
                client: outline.clientAs(ana),
                store,
                state: await store.load(),
                documentsDir,
                privateCollectionId: mine.id,
                deadline: Number.POSITIVE_INFINITY,
            }),
        sharing: async (mode: 'incremental' | 'full' = 'incremental', membershipBudget?: number) => {
            const options: SharingOptions = {
                client: outline.clientAs(ana),
                store,
                state: await store.load(),
                documentsDir,
                mode,
                deadline: Number.POSITIVE_INFINITY,
                membershipBudget,
            };
            return syncSharing(options);
        },
        /** One hook run: pull, push, then the sharing step. */
        turn: async (mode: 'incremental' | 'full' = 'incremental') => {
            await world.pull(mode);
            await world.push();
            return world.sharing(mode);
        },
    };
    return world;

    function pathOf(document: OutlineDocument) {
        const path = paths.get(document.id);
        if (path == null) {
            throw new Error(`No path known for ${document.id}`);
        }
        return path;
    }
}
