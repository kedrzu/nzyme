import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakeOutline, outlineLikeNormalizer } from '../outline/fakeOutline.js';
import type { FakeOutline } from '../outline/fakeOutline.js';
import { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import { StateStore } from '../state/StateStore.js';
import type { SyncState } from '../state/StateStore.js';
import { pathExists } from '../utils/pathExists.js';
import { pull } from './pull.js';
import { push } from './push.js';
import type { PushOptions } from './push.js';

const TEXT = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';

test('an unchanged file sends nothing, also once Outline has normalised what was pushed', async () => {
    const world = await setup({ normalizeText: outlineLikeNormalizer });
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();

    const idle = await world.push();
    expect(world.calls('documents.update')).toBe(0);
    expect(idle.updated).toEqual([]);

    await world.write('wiki/offer.md', (await world.read('wiki/offer.md')).replace('Second paragraph.', '- a _point_'));
    const sent = await world.push();
    expect(sent.updated).toEqual(['wiki/offer.md']);
    const file = await world.read('wiki/offer.md');
    expect(file).toContain('* a *point*');
    const revision = world.outline.getDocument(offer.id)?.revision;

    const again = await world.push();
    expect(again.updated).toEqual([]);
    expect(world.outline.getDocument(offer.id)?.revision).toBe(revision);
    expect(await world.read('wiki/offer.md')).toBe(file);
});

test('a frontmatter-only edit sends nothing and survives the next Outline edit', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();

    await world.write('wiki/offer.md', `---\noutline: ${offer.id}\nstatus: draft\n---\n# Offer\n\n${TEXT}`);
    await world.push();
    expect(world.calls('documents.update')).toBe(0);
    expect(world.outline.getDocument(offer.id)?.revision).toBe(offer.revision);

    await world.edit(offer, TEXT.replace('First paragraph.', 'First, from Outline.'));
    await world.pull();
    expect(await world.read('wiki/offer.md')).toBe(
        `---\noutline: ${offer.id}\nstatus: draft\n---\n# Offer\n\n${TEXT.replace('First paragraph.', 'First, from Outline.')}`,
    );
});

test('a file with conflict markers is never sent; once resolved it is merged with Outline’s later edits', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Second paragraph.', 'Second, local.'),
    );
    const bobs = await world.edit(offer, TEXT.replace('Second paragraph.', 'Second, from Bob.'));
    await world.pull();
    const withMarkers = await world.read('wiki/offer.md');
    expect(withMarkers).toContain('<<<<<<< local');
    await world.write('wiki/new.md', '# New\n\n<<<<<<< local\na\n=======\nb\n>>>>>>> Outline (Bob)\n');

    const report = await world.push();

    expect(report.conflicts.toSorted()).toEqual(['wiki/new.md', 'wiki/offer.md']);
    expect(world.calls('documents.update')).toBe(0);
    expect(world.calls('documents.create')).toBe(0);
    expect(world.outline.getDocument(offer.id)?.text).toBe(bobs.text);
    expect(await world.read('wiki/offer.md')).toBe(withMarkers);

    await world.edit(offer, bobs.text.replace('Third paragraph.', 'Third, later in Outline.'));
    await world.write(
        'wiki/offer.md',
        withMarkers.replace(/<<<<<<< local\n[\s\S]*?>>>>>>> Outline \(Bob\)/, 'Second, resolved.'),
    );
    await rm(join(world.documentsDir, 'wiki/new.md'));
    const resolved = await world.push();

    expect(resolved.updated).toEqual(['wiki/offer.md']);
    expect(world.outline.getDocument(offer.id)?.text).toBe(
        'First paragraph.\n\nSecond, resolved.\n\nThird, later in Outline.',
    );
    expect((await world.store.load()).documents[offer.id]?.conflictRevision).toBeUndefined();
});

test('a conflict resolved by keeping Outline’s version is cleared without sending anything', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Second paragraph.', 'Second, local.'),
    );
    await world.edit(offer, TEXT.replace('Second paragraph.', 'Second, from Bob.'));
    await world.pull();
    expect((await world.store.load()).documents[offer.id]?.conflictRevision).toBeDefined();

    await world.write('wiki/offer.md', (await world.store.readBase(offer.id)) ?? '');
    const report = await world.push();

    expect(report.conflicts).toEqual([]);
    expect(world.calls('documents.update')).toBe(0);
    expect((await world.store.load()).documents[offer.id]?.conflictRevision).toBeUndefined();
});

test('a 409 merges the newer Outline version in before sending, never over it', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Third paragraph.', 'Third, local.'),
    );
    await world.edit(offer, TEXT.replace('First paragraph.', 'First, from Bob.'));

    const report = await world.push();

    const expected = 'First, from Bob.\n\nSecond paragraph.\n\nThird, local.';
    expect(report.updated).toEqual(['wiki/offer.md']);
    expect(world.outline.getDocument(offer.id)?.text).toBe(expected);
    expect(await world.read('wiki/offer.md')).toBe(`---\noutline: ${offer.id}\n---\n# Offer\n\n${expected}`);
    const state = (await world.store.load()).documents[offer.id];
    expect(state?.revision).toBe(world.outline.getDocument(offer.id)?.revision);
    expect(await world.store.readBase(offer.id)).toBe(await world.read('wiki/offer.md'));
});

test('a 409 on the same paragraph leaves markers locally and Outline’s version untouched', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('Second paragraph.', 'Second, local.'),
    );
    const bobs = await world.edit(offer, TEXT.replace('Second paragraph.', 'Second, from Bob.'));

    const report = await world.push();

    expect(report.conflicts).toEqual(['wiki/offer.md']);
    expect(world.outline.getDocument(offer.id)?.text).toBe(bobs.text);
    expect(await world.read('wiki/offer.md')).toContain(
        '<<<<<<< local\nSecond, local.\n=======\nSecond, from Bob.\n>>>>>>> Outline (Bob)',
    );
    expect((await world.store.load()).documents[offer.id]?.conflictRevision).toBe(bobs.revision);
});

test('a deleted file archives its document and never deletes it; a parent whose children remain stays', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const child = world.outline.addDocument({ parent: offer, title: 'Prices', text: 'P.', createdBy: world.ana });
    const old = world.addDocument('Old', TEXT);
    world.addDocument('Keep', TEXT);
    await world.pull();

    await rm(join(world.documentsDir, 'wiki/old.md'));
    await rm(join(world.documentsDir, 'wiki/offer.md'));
    const report = await world.push();

    expect(report.archived).toEqual(['wiki/old.md']);
    expect(world.calls('documents.delete')).toBe(0);
    expect(world.outline.getDocument(old.id)?.archivedAt).not.toBeNull();
    expect(world.outline.getDocument(offer.id)?.archivedAt).toBeNull();
    expect(world.outline.getDocument(child.id)?.archivedAt).toBeNull();
    expect(report.skipped.map(skip => skip.path)).toEqual(['wiki/offer.md']);
    const state = await world.store.load();
    expect(state.documents[old.id]).toBeUndefined();
    expect(state.documents[offer.id]).toBeDefined();
    expect(await world.store.readBase(old.id)).toBeNull();
});

test('a deleted parent stays while it has a child added in Outline since the last pull', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    world.addDocument('Keep', TEXT);
    await world.pull();
    const child = world.outline.addDocument({ parent: offer, title: 'Prices', text: 'P.', createdBy: world.bob });

    await rm(join(world.documentsDir, 'wiki/offer.md'));
    const report = await world.push();

    expect(report.archived).toEqual([]);
    expect(report.skipped).toEqual([
        { path: 'wiki/offer.md', reason: 'Not archived: archiving it would archive "Prices" (only in Outline) too.' },
    ]);
    expect(world.outline.getDocument(offer.id)?.archivedAt).toBeNull();
    expect(world.outline.getDocument(child.id)?.archivedAt).toBeNull();
});

test('a missing documents folder or a broken link to it archives nothing and is reported', async () => {
    const world = await setup();
    world.addDocument('One', TEXT);
    world.addDocument('Two', TEXT);
    await world.pull();
    const before = await world.store.load();

    await rename(world.documentsDir, `${world.documentsDir}-moved`);
    const missing = await world.push();
    await symlink(join(world.documentsDir, '..', 'nowhere'), world.documentsDir);
    const broken = await world.push();

    for (const report of [missing, broken]) {
        expect(report.refusedArchives?.paths).toEqual(['wiki/one.md', 'wiki/two.md']);
        expect(report.archived).toEqual([]);
    }
    expect(world.calls('documents.archive')).toBe(0);
    expect(await world.store.load()).toEqual(before);
});

test('a mostly emptied folder archives nothing; a few deletions in a larger one are archived', async () => {
    const world = await setup();
    for (const title of ['A', 'B', 'C', 'D', 'E', 'F']) {
        world.addDocument(title, TEXT);
    }
    await world.pull();
    const names = ['a', 'b', 'c', 'd'];
    const contents = await Promise.all(names.map(name => world.read(`wiki/${name}.md`)));

    for (const name of names) {
        await rm(join(world.documentsDir, `wiki/${name}.md`));
    }
    const wiped = await world.push();
    expect(wiped.refusedArchives?.paths).toEqual(['wiki/a.md', 'wiki/b.md', 'wiki/c.md', 'wiki/d.md']);
    expect(world.calls('documents.archive')).toBe(0);
    expect(Object.keys((await world.store.load()).documents)).toHaveLength(6);

    for (const [index, name] of names.entries()) {
        await world.write(`wiki/${name}.md`, contents[index] ?? '');
    }
    await rm(join(world.documentsDir, 'wiki/a.md'));
    await rm(join(world.documentsDir, 'wiki/b.md'));
    const tidied = await world.push();
    expect(tidied.refusedArchives).toBeNull();
    expect(tidied.archived.toSorted()).toEqual(['wiki/a.md', 'wiki/b.md']);
});

test('every tracked file gone in a small workspace archives nothing', async () => {
    const world = await setup();
    world.addDocument('One', TEXT);
    world.addDocument('Two', TEXT);
    await world.pull();
    await rm(join(world.documentsDir, 'wiki'), { recursive: true });

    const report = await world.push();

    expect(report.refusedArchives?.paths).toEqual(['wiki/one.md', 'wiki/two.md']);
    expect(world.calls('documents.archive')).toBe(0);
});

test('a run killed between creating a document and writing its id into the file never creates it twice', async () => {
    const world = await setup();
    world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write('wiki/new.md', '# New\n\nFresh text.');

    const dying = new KilledStore(world.store.dir, {
        afterSave: state => Object.keys(state.pendingCreates).length > 0,
    });
    await expect(world.push({ store: dying })).rejects.toThrow('killed');
    expect(await world.read('wiki/new.md')).toBe('# New\n\nFresh text.');

    const report = await world.push();

    expect(world.calls('documents.create')).toBe(1);
    const state = await world.store.load();
    const id = Object.values(state.documents).find(document => document.path === 'wiki/new.md')?.id;
    expect(id).toBeDefined();
    expect(await world.read('wiki/new.md')).toBe(`---\noutline: ${id}\n---\n# New\n\nFresh text.`);
    expect(state.pendingCreates).toEqual({});
    expect(report.created).toEqual([]);
    expect(world.calls('documents.update')).toBe(0);
});

test('a run killed after writing the id but before saving the state adopts the document by that id', async () => {
    const world = await setup();
    world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write('wiki/new.md', '# New\n\nFresh text.');

    const dying = new KilledStore(world.store.dir, 'writeBase');
    await expect(world.push({ store: dying })).rejects.toThrow('killed');
    const withId = await world.read('wiki/new.md');
    expect(withId).toStartWith('---\noutline: ');

    await world.push();

    expect(world.calls('documents.create')).toBe(1);
    const state = await world.store.load();
    expect(
        Object.values(state.documents)
            .map(document => document.path)
            .toSorted(),
    ).toEqual(['wiki/new.md', 'wiki/offer.md']);
    expect(state.pendingCreates).toEqual({});
    expect(await world.read('wiki/new.md')).toBe(withId);
});

test('the canonical rewrite leaves a file edited while the push ran, and the next push sends that edit', async () => {
    const world = await setup({ normalizeText: outlineLikeNormalizer });
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    const sent = (await world.read('wiki/offer.md')).replace('Second paragraph.', '- sent _here_');
    await world.write('wiki/offer.md', sent);
    const typed = sent.replace('Third paragraph.', 'Third, typed meanwhile.');

    let typedOnce = false;
    const client = new OutlineClient({
        url: world.outline.url,
        getAccessToken: () => Promise.resolve(world.ana.token),
        fetch: async (input, init) => {
            if (input.endsWith('/api/documents.update') && !typedOnce) {
                typedOnce = true;
                await world.write('wiki/offer.md', typed);
            }
            return world.outline.fetch(input, init);
        },
    });
    const report = await world.push({ client });

    expect(await world.read('wiki/offer.md')).toBe(typed);
    expect(report.skipped.map(skip => skip.path)).toEqual(['wiki/offer.md']);
    expect((await world.store.load()).documents[offer.id]?.localHash).not.toBe(contentHash(typed));

    await world.push();
    expect(world.outline.getDocument(offer.id)?.text).toBe(
        'First paragraph.\n\n* sent *here*\n\nThird, typed meanwhile.',
    );
});

test('new files are created where their folder says, once, and unplaceable ones are reported', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write('wiki/fresh.md', '# Fresh\n\nNew.');
    await world.write('wiki/fresh/kid.md', '# Kid\n\nNested.');
    await world.write('wiki/offer/terms.md', '# Terms\n\nUnder the offer.');
    await world.write('drafts/idea.md', '# Idea\n\nNot ready.');
    await world.write('mine.md', '# Mine\n\nPrivate.');
    await world.write('shared-with-me/x.md', '# X\n');
    await world.write('random/y.md', '# Y\n');
    await world.write('wiki/orphan/z.md', '# Z\n');

    const report = await world.push();

    expect(report.created.toSorted()).toEqual([
        'drafts/idea.md',
        'mine.md',
        'wiki/fresh.md',
        'wiki/fresh/kid.md',
        'wiki/offer/terms.md',
    ]);
    expect(report.skipped.map(skip => skip.path).toSorted()).toEqual([
        'random/y.md',
        'shared-with-me/x.md',
        'wiki/orphan/z.md',
    ]);
    const state = await world.store.load();
    const byPath = new Map(Object.values(state.documents).map(document => [document.path, document.id]));
    const remote = (path: string) => world.outline.getDocument(byPath.get(path) ?? '');
    expect(remote('wiki/fresh/kid.md')?.parentDocumentId).toBe(byPath.get('wiki/fresh.md') ?? 'missing');
    expect(remote('wiki/offer/terms.md')?.parentDocumentId).toBe(offer.id);
    expect(remote('wiki/fresh.md')?.publishedAt).not.toBeNull();
    expect(remote('drafts/idea.md')?.publishedAt).toBeNull();
    expect(remote('mine.md')?.collectionId).toBe(world.mine.id);
    expect(await world.read('wiki/fresh/kid.md')).toBe(
        `---\noutline: ${byPath.get('wiki/fresh/kid.md')}\n---\n# Kid\n\nNested.`,
    );

    await world.push();
    expect(world.calls('documents.create')).toBe(5);
    expect(world.calls('documents.update')).toBe(0);
});

test('an empty private collection gets a folder on a full pull, and a file placed there is created in it', async () => {
    const world = await setup();
    world.addDocument('Offer', TEXT);
    await world.pull('full');

    const state = await world.store.load();
    expect(state.collections[world.mine.id]).toBe('ana-private');
    expect((await stat(join(world.documentsDir, 'ana-private'))).isDirectory()).toBe(true);

    await world.write('ana-private/note.md', '# Note\n\nMine.');
    const report = await world.push();

    expect(report.created).toEqual(['ana-private/note.md']);
    expect(report.skipped).toEqual([]);
    const created = Object.values((await world.store.load()).documents).find(
        document => document.path === 'ana-private/note.md',
    );
    expect(world.outline.getDocument(created?.id ?? '')?.collectionId).toBe(world.mine.id);
});

test('a collection missing from the full pass leaves the map; its folder goes only when it holds no file', async () => {
    const world = await setup();
    await world.pull('full');
    const state = await world.store.load();
    await world.store.save({ ...state, collections: { ...state.collections, gone: 'old-notes', empty: 'old-empty' } });
    await world.write('old-notes/left.md', '# Left\n\nStill mine.');
    await mkdir(join(world.documentsDir, 'old-empty'));

    await world.pull('full');

    const after = await world.store.load();
    expect(after.collections.gone).toBeUndefined();
    expect(after.collections.empty).toBeUndefined();
    expect(await world.read('old-notes/left.md')).toBe('# Left\n\nStill mine.');
    expect(await pathExists(join(world.documentsDir, 'old-empty'))).toBe(false);
});

test('a file moved to another folder moves its document; a rename in place calls nothing', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const note = world.addDocument('Note', TEXT);
    const memo = world.addDocument('Memo', TEXT);
    await world.pull();

    await world.write('wiki/offer/note.md', await world.read('wiki/note.md'));
    await rm(join(world.documentsDir, 'wiki/note.md'));
    await rename(join(world.documentsDir, 'wiki/memo.md'), join(world.documentsDir, 'wiki/memo-2027.md'));
    const report = await world.push();

    expect(report.moved.toSorted((a, b) => a.from.localeCompare(b.from))).toEqual([
        { from: 'wiki/memo.md', to: 'wiki/memo-2027.md' },
        { from: 'wiki/note.md', to: 'wiki/offer/note.md' },
    ]);
    expect(world.calls('documents.move')).toBe(1);
    expect(world.calls('documents.archive')).toBe(0);
    expect(world.outline.getDocument(note.id)?.parentDocumentId).toBe(offer.id);
    const state = await world.store.load();
    expect(state.documents[note.id]?.path).toBe('wiki/offer/note.md');
    expect(state.documents[memo.id]?.path).toBe('wiki/memo-2027.md');
});

test('a copied file loses the id to the original and becomes a new document', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    const original = await world.read('wiki/offer.md');
    await world.write('wiki/offer-copy.md', original.replace('# Offer', '# Offer copy'));

    const report = await world.push();

    expect(report.copies).toEqual(['wiki/offer-copy.md']);
    expect(report.created).toEqual(['wiki/offer-copy.md']);
    expect(await world.read('wiki/offer.md')).toBe(original);
    expect(world.calls('documents.update')).toBe(0);
    const copy = await world.read('wiki/offer-copy.md');
    expect(copy).not.toContain(offer.id);
    expect(copy).toContain('# Offer copy');
});

test('a tracked file rewritten without its frontmatter stays the same document', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await world.write('wiki/offer.md', `# Offer\n\n${TEXT}\n\nAdded.`);

    const report = await world.push();

    expect(report.created).toEqual([]);
    expect(report.archived).toEqual([]);
    expect(report.updated).toEqual(['wiki/offer.md']);
    expect(world.outline.getDocument(offer.id)?.text).toBe(`${TEXT}\n\nAdded.`);
    expect(await world.read('wiki/offer.md')).toBe(`---\noutline: ${offer.id}\n---\n# Offer\n\n${TEXT}\n\nAdded.`);
});

test('a new local image is uploaded to storage without the Outline token and renamed to its attachment id', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    await world.write(
        'wiki/offer.md',
        `${await world.read('wiki/offer.md')}\n\n![Nowy wykres](_attachments/chart.png "podpis")`,
    );

    const uploads: { url: string; fields: string[] }[] = [];
    const uploadFile = (url: string, body: FormData) => {
        uploads.push({ url, fields: [...body.keys()] });
        return Promise.resolve(new Response(null, { status: 204 }));
    };
    const report = await world.push({ uploadFile });

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.fields).toEqual(['key', 'Content-Type', 'file']);
    const text = world.outline.getDocument(offer.id)?.text ?? '';
    const id = /attachments\.redirect\?id=([\w-]+)/.exec(text)?.[1];
    expect(id).toBeDefined();
    expect(text).toContain(`![Nowy wykres](/api/attachments.redirect?id=${id} "podpis")`);
    expect(await world.read('wiki/offer.md')).toContain(`![Nowy wykres](_attachments/${id}-nowy-wykres "podpis")`);
    expect([...(await readFile(join(world.documentsDir, `wiki/_attachments/${id}-nowy-wykres`)))]).toEqual([1, 2, 3]);
    expect(await pathExists(join(world.documentsDir, 'wiki/_attachments/chart.png'))).toBe(false);
    expect(report.attachmentsUploaded).toEqual(['wiki/_attachments/chart.png']);

    await world.push({ uploadFile });
    expect(uploads).toHaveLength(1);
    expect(world.calls('documents.update')).toBe(1);
});

test('a new file with a local image is created with the image uploaded', async () => {
    const world = await setup();
    world.addDocument('Offer', TEXT);
    await world.pull();
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    await world.write('wiki/fresh.md', '# Fresh\n\n![Chart](_attachments/chart.png)');

    const report = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 204 })) });

    expect(report.created).toEqual(['wiki/fresh.md']);
    expect(report.attachmentsUploaded).toEqual(['wiki/_attachments/chart.png']);
    const created = Object.values((await world.store.load()).documents).find(
        document => document.path === 'wiki/fresh.md',
    );
    expect(world.outline.getDocument(created?.id ?? '')?.text).toMatch(/!\[Chart\]\(\/api\/attachments\.redirect\?id=/);
});

test('one image in _attachments/ linked by two documents is uploaded for each and removed after', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    const note = world.addDocument('Note', TEXT);
    await world.pull();
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    for (const path of ['wiki/offer.md', 'wiki/note.md']) {
        await world.write(path, `${await world.read(path)}\n\n![Chart](_attachments/chart.png)`);
    }

    const report = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 204 })) });

    expect(report.skipped).toEqual([]);
    expect(report.attachmentsUploaded).toHaveLength(2);
    for (const document of [offer, note]) {
        expect(world.outline.getDocument(document.id)?.text).toContain('/api/attachments.redirect?id=');
    }
    expect(await pathExists(join(world.documentsDir, 'wiki/_attachments/chart.png'))).toBe(false);
});

test('a failed upload sends nothing and is retried by the next push', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer', TEXT);
    await world.pull();
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    await world.write('wiki/offer.md', `${await world.read('wiki/offer.md')}\n\n![Chart](_attachments/chart.png)`);

    const failed = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 500 })) });
    expect(failed.skipped.map(skip => skip.path)).toEqual(['wiki/offer.md']);
    expect(world.calls('documents.update')).toBe(0);

    const retried = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 204 })) });
    expect(retried.attachmentsUploaded).toEqual(['wiki/_attachments/chart.png']);
    expect(world.outline.getDocument(offer.id)?.text).toContain('/api/attachments.redirect?id=');
});

test('a link to a local file written in Outline is never uploaded; one the agent adds is', async () => {
    const world = await setup();
    const leaked = '![Scan](../private/contract.png)';
    const offer = world.addDocument('Offer', `${TEXT}\n\n${leaked}`);
    await world.write('private/contract.png', 'secret');
    await world.write('private/contract.pdf', 'secret');
    await world.pull();
    // Added in Outline after the pull: reaches the file only through the push's own merge.
    const later = '[Contract](_attachments/../../private/contract.pdf)';
    await world.edit(offer, `${TEXT}\n\n${leaked}\n\n${later}`);
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    await world.write(
        'wiki/offer.md',
        (await world.read('wiki/offer.md')).replace('First paragraph.', '![Chart](_attachments/chart.png)'),
    );

    const uploadFile = () => Promise.resolve(new Response(null, { status: 204 }));
    const report = await world.push({ uploadFile });
    expect(report.attachmentsUploaded).toEqual(['wiki/_attachments/chart.png']);
    expect(report.updated).toEqual(['wiki/offer.md']);
    const text = world.outline.getDocument(offer.id)?.text ?? '';
    expect(text).toContain(leaked);
    expect(text).toContain(later);

    await world.write('wiki/offer.md', (await world.read('wiki/offer.md')).replace('Second paragraph.', 'Edited.'));
    const again = await world.push({ uploadFile });
    expect(again.updated).toEqual(['wiki/offer.md']);
    expect(again.attachmentsUploaded).toEqual([]);
    expect(world.calls('attachments.create')).toBe(1);
});

test('a new file’s local image stays out of Outline until uploaded, and a failed upload is retried', async () => {
    const world = await setup();
    world.addDocument('Offer', TEXT);
    await world.pull();
    await mkdir(join(world.documentsDir, 'wiki/_attachments'), { recursive: true });
    await writeFile(join(world.documentsDir, 'wiki/_attachments/chart.png'), new Uint8Array([1, 2, 3]));
    await world.write('wiki/fresh.md', '# Fresh\n\nText.\n\n![Chart](_attachments/chart.png)');

    const failed = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 500 })) });
    expect(failed.created).toEqual(['wiki/fresh.md']);
    const created = Object.values((await world.store.load()).documents).find(
        document => document.path === 'wiki/fresh.md',
    );
    expect(world.outline.getDocument(created?.id ?? '')?.text).not.toContain('chart.png');

    const retried = await world.push({ uploadFile: () => Promise.resolve(new Response(null, { status: 204 })) });
    expect(retried.attachmentsUploaded).toEqual(['wiki/_attachments/chart.png']);
    expect(world.outline.getDocument(created?.id ?? '')?.text).toMatch(/!\[Chart\]\(\/api\/attachments\.redirect\?id=/);
});

test('the push stops between documents at the deadline and the next one finishes', async () => {
    const world = await setup();
    world.addDocument('One', TEXT);
    world.addDocument('Two', TEXT);
    await world.pull();
    await world.write('wiki/one.md', `${await world.read('wiki/one.md')}\n\nMore.`);
    await world.write('wiki/two.md', `${await world.read('wiki/two.md')}\n\nMore.`);
    const clock = [0, 100];

    const first = await world.push({ deadline: 50, now: () => clock.shift() ?? 100 });
    expect(first.stoppedAtDeadline).toBe(true);
    expect(first.updated).toEqual(['wiki/one.md']);

    const second = await world.push();
    expect(second.updated).toEqual(['wiki/two.md']);
});

/** Throws as if the process died: right after the first `save` that `afterSave` accepts, or instead of the first `writeBase`. */
class KilledStore extends StateStore {
    private killed = false;

    constructor(
        dir: string,
        private readonly at: { afterSave: (state: SyncState) => boolean } | 'writeBase',
    ) {
        super(dir);
    }

    override async save(state: SyncState) {
        await super.save(state);
        if (this.at !== 'writeBase' && !this.killed && this.at.afterSave(state)) {
            this.killed = true;
            throw new Error('killed');
        }
    }

    override async writeBase(id: string, content: string) {
        if (this.at === 'writeBase' && !this.killed) {
            this.killed = true;
            throw new Error('killed');
        }
        await super.writeBase(id, content);
    }
}

async function setup(options: { normalizeText?: (text: string) => string } = {}) {
    const outline: FakeOutline = fakeOutline(options);
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const mine = outline.addCollection({ name: 'Ana private', members: [{ user: ana, permission: 'admin' }] });
    const root = await mkdtemp(join(tmpdir(), 'push-'));
    const store = new StateStore(join(root, 'state'));
    const documentsDir = join(root, 'docs');
    const recoveredDir = join(root, 'recovered');

    return {
        outline,
        ana,
        bob,
        mine,
        store,
        documentsDir,
        addDocument: (title: string, text: string) =>
            outline.addDocument({ collection: wiki, title, text, createdBy: ana }),
        edit: (document: OutlineDocument, text: string) =>
            outline.clientAs(bob).documents.update({ id: document.id, text }),
        read: (path: string) => readFile(join(documentsDir, path), 'utf8'),
        write: async (path: string, content: string) => {
            await mkdir(join(documentsDir, path, '..'), { recursive: true });
            await writeFile(join(documentsDir, path), content);
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
        push: async (overrides: Partial<PushOptions> = {}) =>
            push({
                client: outline.clientAs(ana),
                store,
                state: await store.load(),
                documentsDir,
                privateCollectionId: mine.id,
                deadline: Number.POSITIVE_INFINITY,
                ...overrides,
            }),
    };
}
