import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakeOutline, outlineLikeNormalizer } from '../outline/fakeOutline.js';
import type { FakeOutline } from '../outline/fakeOutline.js';
import { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import { StateStore } from '../state/StateStore.js';
import type { SyncEvent } from '../state/StateStore.js';
import { pathExists } from '../utils/pathExists.js';
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

test('a remote edit keeps the local frontmatter keys of the file', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull('incremental');
    // As a push would leave it: the key in the file, in the base and in the state's hash.
    const withKeys = `---\noutline: ${offer.id}\nstatus: draft\n---\n# Offer\n\n${TEXT}`;
    await world.write('wiki/offer.md', withKeys);
    await world.store.writeBase(offer.id, withKeys);
    const state = await world.store.load();
    const known = state.documents[offer.id]!;
    await world.store.save({
        ...state,
        documents: { [offer.id]: { ...known, localHash: contentHash(withKeys) } },
    });

    await world.edit(offer, 'Rewritten in Outline.');
    await world.pull('incremental');

    expect(await world.read('wiki/offer.md')).toBe(
        `---\noutline: ${offer.id}\nstatus: draft\n---\n# Offer\n\nRewritten in Outline.`,
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

test('a full pass keeps a document the paged listing skipped because a partner edited it mid-walk', async () => {
    const world = await setup();
    const skipped = world.addDocument('Skipped', TEXT);
    for (let index = 0; index < 100; index++) {
        world.addDocument(`Doc ${index}`, TEXT);
    }
    await world.pull('full');
    await world.write('wiki/skipped.md', `${await world.read('wiki/skipped.md')}\n\nUnsent work.`);
    // Newest first: the oldest document is on the second page until Bob's edit moves it to the first, already read.
    let lists = 0;
    const fetchAsAna = world.outline.fetchAs(world.ana);
    const client = new OutlineClient({
        url: 'https://outline.test',
        getAccessToken: () => Promise.resolve(world.ana.token),
        fetch: async (input, init) => {
            const response = await fetchAsAna(input, init);
            if (input.endsWith('/documents.list') && ++lists === 1) {
                await world.edit(skipped, 'Edited in Outline during the listing.');
            }
            return response;
        },
    });

    const report = await world.pull('full', { client });

    expect(report.removed).toEqual([]);
    expect(report.recovered).toEqual([]);
    expect(await world.read('wiki/skipped.md')).toContain('Unsent work.');
    expect((await world.store.load()).documents[skipped.id]).toBeDefined();
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

test('a partner’s edit to a document shared from a collection the user cannot read, and to its child, arrives with the next quick pass in one request', async () => {
    const world = await setup();
    const secret = world.outline.addCollection({ name: 'Secret', members: [{ user: world.bob, permission: 'admin' }] });
    const shared = world.outline.addDocument({ collection: secret, title: 'Shared', text: TEXT, createdBy: world.bob });
    const child = world.outline.addDocument({ parent: shared, title: 'Child', text: TEXT, createdBy: world.bob });
    world.outline.shareDocument({ document: shared, user: world.ana, permission: 'read' });
    await world.pull('full');
    expect(await world.read('shared-with-me/shared/child.md')).toContain('# Child');

    await world.edit(shared, 'Shared, edited by Bob.');
    await world.edit(child, 'Child, edited by Bob.');
    const requests = async (action: () => Promise<unknown>) => {
        const before = world.outline.requests.length;
        await action();
        return world.outline.requests
            .slice(before)
            .filter(request => request.userId === world.ana.id)
            .map(request => request.method);
    };
    const quick = await requests(() => world.pull('incremental'));
    const nothingChanged = await requests(() => world.pull('incremental'));

    expect(await world.read('shared-with-me/shared.md')).toBe(
        `---\noutline: ${shared.id}\n---\n# Shared\n\nShared, edited by Bob.`,
    );
    expect(await world.read('shared-with-me/shared/child.md')).toBe(
        `---\noutline: ${child.id}\n---\n# Child\n\nChild, edited by Bob.`,
    );
    expect(quick).toEqual(['documents.search']);
    expect(nothingChanged).toEqual(['documents.search']);
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

test('a file a killed run wrote but never recorded is taken over when unchanged, and kept beside a new copy when edited', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const plan = world.addDocument('Plan', TEXT);
    // As a run killed before its state was saved leaves them: written, untracked, one edited since.
    await world.write('wiki/offer.md', `---\noutline: ${offer.id}\n---\n# Offer\n\n${TEXT}`);
    await world.write('wiki/plan.md', `---\noutline: ${plan.id}\n---\n# Plan\n\nEdited after the kill.`);

    const report = await world.pull('incremental');

    expect(report.written.toSorted()).toEqual(['wiki/offer.md', 'wiki/plan-2.md']);
    expect((await readdir(join(world.documentsDir, 'wiki'))).toSorted()).toEqual(['offer.md', 'plan-2.md', 'plan.md']);
    expect(await world.read('wiki/plan.md')).toContain('Edited after the kill.');
    expect((await world.store.load()).documents[offer.id]?.path).toBe('wiki/offer.md');
});

test('a move a killed run made but never recorded is finished, not given a numbered name', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const archive = world.addDocument('Archive', '');
    world.outline.addDocument({ parent: offer, title: 'Price list', text: 'Prices.', createdBy: world.ana });
    await world.pull('incremental');

    await world.outline.clientAs(world.bob).documents.move({ id: offer.id, parentDocumentId: archive.id });
    // The killed run renamed the file, then died before moving the children's folder and saving the state.
    await world.write('wiki/archive/offer.md', await world.read('wiki/offer.md'));
    await rm(join(world.documentsDir, 'wiki/offer.md'));
    const report = await world.pull('incremental');

    expect(report.moved).toEqual([{ from: 'wiki/offer.md', to: 'wiki/archive/offer.md' }]);
    expect((await readdir(join(world.documentsDir, 'wiki/archive'))).toSorted()).toEqual(['offer', 'offer.md']);
    expect(await world.read('wiki/archive/offer/price-list.md')).toContain('Prices.');
    expect((await world.store.load()).documents[offer.id]?.path).toBe('wiki/archive/offer.md');
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
    // The first document is not checked against the deadline; the second sees 0, the third 100.
    const clock = [0, 100];

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
    expect(done.initialPull).toEqual({ complete: true });
    expect(done.fullPassDone).toBeUndefined();
    expect(done.cursor).not.toBeNull();
});

test('a deadline already passed when the listing returns still lets each pull write one document, until the passes finish', async () => {
    const world = await setup();
    const [one, two, three] = ['One', 'Two', 'Three'].map(title => world.addDocument(title, TEXT));
    const late = { deadline: 0, now: () => 100 };

    for (const done of [1, 2]) {
        const report = await world.pull('full', late);
        expect(report.stoppedAtDeadline).toBe(true);
        expect(report.written).toHaveLength(1);
        expect(Object.keys((await world.store.load()).fullPassDone ?? {})).toHaveLength(done);
    }
    const last = await world.pull('full', late);
    expect(last.stoppedAtDeadline).toBe(false);
    expect(last.written).toHaveLength(1);
    expect((await world.store.load()).initialPull).toEqual({ complete: true });

    // A later full pass finishes too.
    await world.edit(one!, 'Edited one.');
    await world.edit(three!, 'Edited three.');
    await world.outline.clientAs(world.bob).documents.delete({ id: two!.id });

    expect((await world.pull('full', late)).stoppedAtDeadline).toBe(true);
    const finished = await world.pull('full', late);
    expect(finished.stoppedAtDeadline).toBe(false);
    expect(finished.removed).toEqual(['wiki/two.md']);
    expect((await world.store.load()).lastFullPass).not.toBeNull();
});

test('a full pass whose listing always overruns finishes even when two documents are skipped on every call', async () => {
    const world = await setup();
    const [one, two, three] = ['One', 'Two', 'Three'].map(title => world.addDocument(title, TEXT));
    await world.pull('full');
    // Both files are gone locally and changed in Outline, so every pull skips them and they keep needing work.
    await rm(join(world.documentsDir, 'wiki/one.md'));
    await rm(join(world.documentsDir, 'wiki/two.md'));
    await world.edit(one!, 'Edited one.');
    await world.edit(two!, 'Edited two.');
    await world.outline.clientAs(world.bob).documents.delete({ id: three!.id });
    const late = { deadline: 0, now: () => 100 };

    expect((await world.pull('full', late)).stoppedAtDeadline).toBe(true);
    const finished = await world.pull('full', late);

    expect(finished.stoppedAtDeadline).toBe(false);
    expect(finished.skipped.map(skip => skip.reason)).toEqual(['The file is missing locally.']);
    expect(finished.removed).toEqual(['wiki/three.md']);
    const state = await world.store.load();
    expect(state.lastFullPass).not.toBeNull();
    expect(state.fullPassDone).toBeUndefined();
});

test('an unfinished full pass redoes a document that changed again after it was worked on', async () => {
    const world = await setup();
    const documents = ['One', 'Two'].map(title => world.addDocument(title, TEXT));
    const late = { deadline: 0, now: () => 100 };

    const [firstPath] = (await world.pull('full', late)).written;
    const first = documents.find(document => `wiki/${document.title.toLowerCase()}.md` === firstPath)!;
    const other = documents.find(document => document !== first)!;
    await world.edit(first, 'Edited again.');
    const second = await world.pull('full', late);

    expect(second.stoppedAtDeadline).toBe(true);
    expect(await readFile(join(world.documentsDir, firstPath!), 'utf8')).toContain('Edited again.');
    expect((await world.pull('full', late)).stoppedAtDeadline).toBe(false);
    expect(await pathExists(join(world.documentsDir, `wiki/${other.title.toLowerCase()}.md`))).toBe(true);
});

test('a deadline counted from the end of the listing gives the documents the whole span', async () => {
    const world = await setup();
    for (const title of ['One', 'Two', 'Three']) {
        world.addDocument(title, TEXT);
    }

    const report = await world.pull('full', { deadline: { afterDiscoveryMs: 50 }, now: () => 1000 });

    expect(report.stoppedAtDeadline).toBe(false);
    expect(report.written).toHaveLength(3);
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
