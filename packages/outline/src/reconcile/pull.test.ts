import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakeOutline, outlineLikeNormalizer } from '../outline/fakeOutline.js';
import type { FakeOutline } from '../outline/fakeOutline.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import { StateStore } from '../state/StateStore.js';
import type { SyncEvent } from '../state/StateStore.js';
import { pull } from './pull.js';
import type { PullOptions } from './pull.js';

const TEXT = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';

test('a pull that finds nothing new touches no file and leaves the state as it was', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    world.outline.addDocument({ parent: offer, title: 'Price list', text: 'Prices.', createdBy: world.ana });
    world.outline.addDocument({ title: 'My draft', text: 'Draft.', createdBy: world.ana, published: false });

    const first = await world.pull('incremental');
    expect(first.written.toSorted()).toEqual(['drafts/my-draft.md', 'wiki/offer.md', 'wiki/offer/price-list.md']);
    expect(await world.read('wiki/offer.md')).toBe(`---\noutline: ${offer.id}\n---\n# Offer\n\n${TEXT}`);

    const files = ['drafts/my-draft.md', 'wiki/offer.md', 'wiki/offer/price-list.md'];
    const before = await snapshot(world, files);
    const stateBefore = await readFile(join(world.store.dir, 'state.json'), 'utf8');
    const second = await world.pull('incremental');

    expect(await snapshot(world, files)).toEqual(before);
    expect(await readFile(join(world.store.dir, 'state.json'), 'utf8')).toBe(stateBefore);
    expect([...second.written, ...second.moved.map(move => move.to), ...second.removed]).toEqual([]);
});

test('a remote edit replaces an unedited file and becomes the new base, without marking it for push', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');

    const updated = await world.edit(offer, 'First paragraph, edited in Outline.\n\nSecond paragraph.');
    const report = await world.pull('incremental');

    const expected = `---\noutline: ${offer.id}\n---\n# Offer\n\n${updated.text}`;
    expect(await world.read('wiki/offer.md')).toBe(expected);
    expect(await world.store.readBase(offer.id)).toBe(expected);
    const state = await world.store.load();
    expect(state.documents[offer.id]?.revision).toBe(updated.revision);
    expect(state.documents[offer.id]?.localHash).toBe(contentHash(expected));
    expect(report.toPush).toEqual([]);
});

test('a remote edit keeps the share list and local frontmatter keys of the file', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');
    // As the sharing sync would leave it: the list in the file, in the base and in the state.
    const withShares = `---\noutline: ${offer.id}\nshared: [Ania Kowalska]\nstatus: draft\n---\n# Offer\n\n${TEXT}`;
    await world.write('wiki/offer.md', withShares);
    await world.store.writeBase(offer.id, withShares);
    const state = await world.store.load();
    const known = state.documents[offer.id]!;
    await world.store.save({
        ...state,
        documents: { [offer.id]: { ...known, shared: ['Ania Kowalska'], localHash: contentHash(withShares) } },
    });

    await world.edit(offer, 'Rewritten in Outline.');
    await world.pull('incremental');

    expect(await world.read('wiki/offer.md')).toBe(
        `---\noutline: ${offer.id}\nshared: [Ania Kowalska]\nstatus: draft\n---\n# Offer\n\nRewritten in Outline.`,
    );
});

test('edits to different paragraphs on both sides merge cleanly and leave the local part for the push', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');

    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Third paragraph.', 'Third, local.'),
    );
    await world.edit(offer, TEXT.replace('First paragraph.', 'First, from Outline.'));
    const report = await world.pull('incremental');

    const merged = await world.read('wiki/offer.md');
    expect(merged).toContain('First, from Outline.');
    expect(merged).toContain('Third, local.');
    const base = await world.store.readBase(offer.id);
    expect(base).toContain('First, from Outline.');
    expect(base).toContain('Third paragraph.');
    // The push sees the file differ from what sync last recorded, and sends only the local paragraph.
    expect((await world.store.load()).documents[offer.id]?.localHash).toBe(contentHash(base ?? ''));
    expect(report.toPush).toEqual(['wiki/offer.md']);
    expect(report.conflicts).toEqual([]);
});

test('the same edit made on both sides is not marked for push, even through Outline’s Markdown normalisation', async () => {
    const world = await setup({ normalizeText: outlineLikeNormalizer });
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');

    const edited = TEXT.replace('Second paragraph.', '- a _point_');
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace(TEXT, outlineLikeNormalizer(edited)),
    );
    await world.edit(offer, edited);
    const report = await world.pull('incremental');

    const file = await world.read('wiki/offer.md');
    expect(file).toContain('* a *point*');
    expect((await world.store.load()).documents[offer.id]?.localHash).toBe(contentHash(file));
    expect(report.toPush).toEqual([]);
});

test('a conflict keeps both versions, survives later Outline edits, and once resolved merges with them', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');

    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Second paragraph.', 'Second, local.'),
    );
    const conflicted = await world.edit(offer, TEXT.replace('Second paragraph.', 'Second, from Bob.'));
    const report = await world.pull('incremental');

    const withMarkers = await world.read('wiki/offer.md');
    expect(withMarkers).toContain('<<<<<<< local\nSecond, local.\n=======\nSecond, from Bob.\n>>>>>>> Outline (Bob)');
    expect(report.conflicts).toEqual(['wiki/offer.md']);
    const state = (await world.store.load()).documents[offer.id];
    expect(state?.conflictRevision).toBe(conflicted.revision);
    expect(await world.store.readBase(offer.id)).toContain('Second, from Bob.');

    // Outline moves on while the conflict is open: the file is left alone.
    const later = await world.edit(offer, conflicted.text.replace('Third paragraph.', 'Third, later in Outline.'));
    await world.pull('incremental');
    expect(await world.read('wiki/offer.md')).toBe(withMarkers);

    // The agent resolves the markers; the next merge must not re-conflict and must not drop Bob's later edit.
    await world.write(
        'wiki/offer.md',
        withMarkers.replace(/<<<<<<< local\n[\s\S]*?>>>>>>> Outline \(Bob\)/, 'Second, resolved.'),
    );
    const resolved = await world.pull('incremental');

    const file = await world.read('wiki/offer.md');
    expect(file).toBe(
        `---\noutline: ${offer.id}\n---\n# Offer\n\nFirst paragraph.\n\nSecond, resolved.\n\nThird, later in Outline.`,
    );
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.toPush).toEqual(['wiki/offer.md']);
    const after = (await world.store.load()).documents[offer.id];
    expect(after?.revision).toBe(later.revision);
    expect(after?.conflictRevision).toBeUndefined();
});

test('a file edited while the pull runs is not overwritten and is merged by the next pull', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');
    await world.edit(offer, TEXT.replace('First paragraph.', 'First, from Outline.'));

    const userEdit = (await world.read('wiki/offer.md')).replace('Third paragraph.', 'Third, typed meanwhile.');
    const editingStore = new EditingStore(world.store.dir, () => world.write('wiki/offer.md', userEdit));
    const report = await world.pull('incremental', { store: editingStore });

    expect(await world.read('wiki/offer.md')).toBe(userEdit);
    expect(report.skipped.map(skip => skip.path)).toEqual(['wiki/offer.md']);

    await world.pull('incremental');
    const merged = await world.read('wiki/offer.md');
    expect(merged).toContain('First, from Outline.');
    expect(merged).toContain('Third, typed meanwhile.');
});

test('a full pass deletes unedited files of vanished documents and recovers edited ones; an incremental pass touches neither', async () => {
    const world = await setup();
    const archived = world.addDocument('Archived', TEXT);
    const deleted = world.addDocument('Deleted', TEXT);
    const edited = world.addDocument('Edited', TEXT);
    const occupied = world.addDocument('Occupied', TEXT);
    await world.pull('incremental');
    await world.write('wiki/edited.md', `${await world.read('wiki/edited.md')}\n\nUnsent work.`);
    await world.write('wiki/occupied.md', `${await world.read('wiki/occupied.md')}\n\nUnsent too.`);
    await mkdir(join(world.recoveredDir, 'wiki'), { recursive: true });
    await writeFile(join(world.recoveredDir, 'wiki/occupied.md'), 'recovered earlier');
    const bob = world.outline.clientAs(world.bob);
    await bob.documents.archive({ id: archived.id });
    await bob.documents.delete({ id: deleted.id });
    await bob.documents.delete({ id: edited.id });
    await bob.documents.archive({ id: occupied.id });

    await world.pull('incremental');
    expect((await readdir(join(world.documentsDir, 'wiki'))).toSorted()).toEqual([
        'archived.md',
        'deleted.md',
        'edited.md',
        'occupied.md',
    ]);

    const report = await world.pull('full');

    expect(await pathExists(join(world.documentsDir, 'wiki'))).toBe(false);
    expect(report.removed.toSorted()).toEqual(['wiki/archived.md', 'wiki/deleted.md']);
    expect(report.recovered.toSorted()).toEqual(['wiki/edited.md', 'wiki/occupied-2.md']);
    expect(await readFile(join(world.recoveredDir, 'wiki/edited.md'), 'utf8')).toContain('Unsent work.');
    expect(await readFile(join(world.recoveredDir, 'wiki/occupied-2.md'), 'utf8')).toContain('Unsent too.');
    expect(await readFile(join(world.recoveredDir, 'wiki/occupied.md'), 'utf8')).toBe('recovered earlier');
    const state = await world.store.load();
    expect(Object.keys(state.documents)).toEqual([]);
    const events: SyncEvent[] = [
        { kind: 'recovered', path: 'wiki/edited.md' },
        { kind: 'recovered', path: 'wiki/occupied-2.md' },
    ];
    expect(state.events.toSorted((a, b) => a.path.localeCompare(b.path))).toEqual(events);
    expect(await world.store.readBase(edited.id)).toBeNull();
});

test('a document the user lost access to disappears from the documents folder', async () => {
    const world = await setup();
    const secret = world.outline.addCollection({ name: 'Secret', members: [{ user: world.bob, permission: 'admin' }] });
    const shared = world.outline.addDocument({ collection: secret, title: 'Shared', text: TEXT, createdBy: world.bob });
    world.outline.shareDocument({ document: shared, user: world.ana, permission: 'read' });
    await world.pull('full');
    expect(await world.read('shared-with-me/shared.md')).toContain('# Shared');

    await world.outline.clientAs(world.bob).documents.removeUser({ id: shared.id, userId: world.ana.id });
    const report = await world.pull('full');

    expect(report.removed).toEqual(['shared-with-me/shared.md']);
    expect(await pathExists(join(world.documentsDir, 'shared-with-me'))).toBe(false);
    expect((await world.store.load()).documents[shared.id]).toBeUndefined();
});

test('a move in Outline moves the file under its old name with its children folder; a new title changes only the heading', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const archive = world.addDocument('Archive', '');
    const child = world.outline.addDocument({
        parent: offer,
        title: 'Price list',
        text: 'Prices.',
        createdBy: world.ana,
    });
    await world.pull('incremental');
    await world.write('wiki/offer/local-notes.md', '# Not pushed yet\n');

    const bob = world.outline.clientAs(world.bob);
    await bob.documents.move({ id: offer.id, parentDocumentId: archive.id });
    await bob.documents.update({ id: offer.id, title: 'Offer 2027' });
    const report = await world.pull('incremental');

    expect(report.moved).toEqual([{ from: 'wiki/offer.md', to: 'wiki/archive/offer.md' }]);
    expect(await world.read('wiki/archive/offer.md')).toStartWith(`---\noutline: ${offer.id}\n---\n# Offer 2027\n`);
    expect(await world.read('wiki/archive/offer/price-list.md')).toContain('Prices.');
    expect(await world.read('wiki/archive/offer/local-notes.md')).toBe('# Not pushed yet\n');
    expect((await readdir(join(world.documentsDir, 'wiki'))).toSorted()).toEqual(['archive', 'archive.md']);
    const state = await world.store.load();
    expect(state.documents[child.id]?.path).toBe('wiki/archive/offer/price-list.md');
    expect(state.documents[offer.id]?.parentId).toBe(archive.id);
});

test('attachments download without the Outline token, a failed one is retried by the next pull, and an unlinked one is removed', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const client = world.outline.clientAs(world.ana);
    const diagram = await client.attachments.create({
        name: 'diagram.png',
        size: 3,
        contentType: 'image/png',
        documentId: offer.id,
    });
    const plain = await client.attachments.create({
        name: 'x',
        size: 3,
        contentType: 'image/png',
        documentId: offer.id,
    });
    await world.edit(
        offer,
        `${TEXT}\n\n![Diagram](${world.outline.url}${diagram.attachment.url})\n\n![](${plain.attachment.url})`,
    );

    const calls: { url: string; init: RequestInit | undefined }[] = [];
    let failNext = true;
    const fetchFile = (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes(plain.attachment.id) && failNext) {
            failNext = false;
            return Promise.resolve(new Response('denied', { status: 403 }));
        }
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    };

    const first = await world.pull('incremental', { fetchFile });
    const diagramPath = `wiki/_attachments/${diagram.attachment.id}-diagram`;
    const plainPath = `wiki/_attachments/${plain.attachment.id}`;
    expect(await world.read('wiki/offer.md')).toContain(`![Diagram](_attachments/${diagram.attachment.id}-diagram)`);
    expect([...(await readFile(join(world.documentsDir, diagramPath)))]).toEqual([1, 2, 3]);
    expect(first.attachmentsFailed.map(failure => failure.path)).toEqual([plainPath]);
    expect(calls.every(call => call.init === undefined)).toBe(true);

    const second = await world.pull('incremental', { fetchFile });
    expect(second.attachmentsDownloaded).toEqual([plainPath]);
    expect(await pathExists(join(world.documentsDir, plainPath))).toBe(true);

    await world.edit(offer, `${TEXT}\n\n![](${plain.attachment.url})`);
    await world.pull('incremental', { fetchFile });
    expect(await pathExists(join(world.documentsDir, diagramPath))).toBe(false);
    expect(await pathExists(join(world.documentsDir, plainPath))).toBe(true);
});

test('the initial pull stops at the deadline and the next one finishes it before the cursor advances', async () => {
    const world = await setup();
    for (const title of ['One', 'Two', 'Three']) {
        world.addDocument(title, TEXT);
    }
    const clock = [0, 0, 100];

    const first = await world.pull('incremental', { deadline: 50, now: () => clock.shift() ?? 100 });

    expect(first.stoppedAtDeadline).toBe(true);
    expect(first.written).toHaveLength(2);
    const interrupted = await world.store.load();
    expect(interrupted.initialPull.complete).toBe(false);
    expect(interrupted.cursor).toBeNull();

    const second = await world.pull('incremental');
    expect(second.written).toHaveLength(1);
    expect((await readdir(join(world.documentsDir, 'wiki'))).toSorted()).toEqual(['one.md', 'three.md', 'two.md']);
    const done = await world.store.load();
    expect(done.initialPull).toEqual({ complete: true, position: null });
    expect(done.cursor).not.toBeNull();
});

/** Runs `beforeRead` when the merge base is read: after the pull read the file, before it writes it. */
class EditingStore extends StateStore {
    constructor(
        dir: string,
        private readonly beforeRead: () => Promise<void>,
    ) {
        super(dir);
    }

    override async readBase(id: string) {
        await this.beforeRead();
        return super.readBase(id);
    }
}

async function setup(options: { normalizeText?: (text: string) => string } = {}) {
    const outline: FakeOutline = fakeOutline(options);
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const root = await mkdtemp(join(tmpdir(), 'pull-'));
    const store = new StateStore(join(root, 'state'));
    const documentsDir = join(root, 'docs');
    const recoveredDir = join(root, 'recovered');

    return {
        outline,
        ana,
        bob,
        store,
        documentsDir,
        recoveredDir,
        addDocument: (title: string, text: string) =>
            outline.addDocument({ collection: wiki, title, text, createdBy: ana }),
        edit: (document: OutlineDocument, text: string) =>
            outline.clientAs(bob).documents.update({ id: document.id, text }),
        read: (path: string) => readFile(join(documentsDir, path), 'utf8'),
        write: async (path: string, content: string) => {
            await mkdir(join(documentsDir, path, '..'), { recursive: true });
            await writeFile(join(documentsDir, path), content);
        },
        pull: async (mode: PullOptions['mode'], overrides: Partial<PullOptions> = {}) =>
            pull({
                client: outline.clientAs(ana),
                store,
                state: await store.load(),
                documentsDir,
                recoveredDir,
                mode,
                deadline: Number.POSITIVE_INFINITY,
                ...overrides,
            }),
    };
}

async function snapshot(world: { documentsDir: string }, paths: string[]) {
    return Promise.all(
        paths.map(async path => {
            const file = join(world.documentsDir, path);
            return { path, mtime: (await stat(file)).mtimeMs, content: await readFile(file, 'utf8') };
        }),
    );
}

async function pathExists(path: string) {
    return stat(path).then(
        () => true,
        () => false,
    );
}
