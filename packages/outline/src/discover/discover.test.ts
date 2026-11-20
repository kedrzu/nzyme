import { expect, test } from 'bun:test';

import { fakeOutline } from '../outline/fakeOutline.js';
import type { FakeOutline, FakeUser } from '../outline/fakeOutline.js';
import { discoverFull, discoverIncremental } from './discover.js';

function ids(documents: { id: string }[]) {
    return documents.map(document => document.id).toSorted();
}

function minutesAfter(iso: string, minutes: number) {
    return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

async function requestsMadeBy(outline: FakeOutline, user: FakeUser, action: () => Promise<unknown>) {
    const before = outline.requests.length;
    await action();
    return outline.requests.slice(before).filter(request => request.userId === user.id).length;
}

function twoPartners() {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    return { outline, ana, bob };
}

test('authorization: another user’s private collection and drafts never appear in discovery, full or incremental', async () => {
    const { outline, ana, bob } = twoPartners();
    const secret = outline.addCollection({ name: 'Secret', members: [{ user: ana, permission: 'admin' }] });
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    outline.addDocument({ collection: secret, title: 'Hidden', createdBy: ana });
    outline.addDocument({ title: 'Ana draft', createdBy: ana, published: false });
    const visible = outline.addDocument({ collection: open, title: 'Visible', createdBy: ana });
    const bobDraft = outline.addDocument({ title: 'Bob draft', createdBy: bob, published: false });

    const bobClient = outline.clientAs(bob);
    const full = await discoverFull(bobClient, null);
    const incremental = await discoverIncremental(bobClient, { cursor: null, knownCollectionIds: [] });

    expect(ids(full.documents)).toEqual([visible.id, bobDraft.id].toSorted());
    expect(ids(incremental.documents)).toEqual([visible.id, bobDraft.id].toSorted());
    expect(full.collections.map(collection => collection.name)).toEqual(['Open']);
    expect(incremental.collections.map(collection => collection.name)).toEqual(['Open']);
    expect((await discoverFull(outline.clientAs(ana), null)).documents).toHaveLength(3);
});

test('a document reachable by collection, direct share and group share is listed exactly once', async () => {
    const { outline, ana, bob } = twoPartners();
    const team = outline.addGroup({ name: 'Team', members: [bob] });
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const doc = outline.addDocument({ collection: open, title: 'Offer', createdBy: ana });
    const child = outline.addDocument({ parent: doc, title: 'Child', createdBy: ana });
    outline.shareDocument({ document: doc, user: bob, permission: 'read' });
    outline.shareDocument({ document: doc, group: team, permission: 'read' });
    const client = outline.clientAs(bob);

    const full = await discoverFull(client, null);
    const incremental = await discoverIncremental(client, { cursor: null, knownCollectionIds: [open.id] });

    expect(ids(full.documents)).toEqual([doc.id, child.id].toSorted());
    expect(ids(incremental.documents)).toEqual([doc.id, child.id].toSorted());
});

test('full pass finds shared roots and their whole subtree in a collection the user cannot see, directly and through a group', async () => {
    const { outline, ana, bob } = twoPartners();
    const team = outline.addGroup({ name: 'Team', members: [bob] });
    const secret = outline.addCollection({ name: 'Secret', members: [{ user: ana, permission: 'admin' }] });
    const direct = outline.addDocument({ collection: secret, title: 'Direct', createdBy: ana });
    const directChild = outline.addDocument({ parent: direct, title: 'Direct child', createdBy: ana });
    const directGrandchild = outline.addDocument({ parent: directChild, title: 'Grandchild', createdBy: ana });
    const viaGroup = outline.addDocument({ collection: secret, title: 'Via group', createdBy: ana });
    const viaGroupChild = outline.addDocument({ parent: viaGroup, title: 'Group child', createdBy: ana });
    outline.addDocument({ collection: secret, title: 'Not shared', createdBy: ana });
    outline.shareDocument({ document: direct, user: bob, permission: 'read' });
    outline.shareDocument({ document: viaGroup, group: team, permission: 'read' });

    const full = await discoverFull(outline.clientAs(bob), null);

    expect(ids(full.documents)).toEqual(
        [direct.id, directChild.id, directGrandchild.id, viaGroup.id, viaGroupChild.id].toSorted(),
    );
    expect(full.collections).toEqual([]);
});

test('full pass covers a collection beyond one page of documents', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const created = Array.from({ length: 105 }, (_, index) =>
        outline.addDocument({ collection: open, title: `Doc ${index}`, createdBy: ana }),
    );

    const full = await discoverFull(outline.clientAs(ana), null);

    expect(ids(full.documents)).toEqual(ids(created));
});

test('full pass omits archived and deleted documents, so the caller sees a known id missing', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read_write' });
    const kept = outline.addDocument({ collection: open, title: 'Kept', createdBy: ana });
    const archived = outline.addDocument({ collection: open, title: 'Archived', createdBy: ana });
    const deleted = outline.addDocument({ collection: open, title: 'Deleted', createdBy: ana });
    const client = outline.clientAs(ana);
    await client.documents.archive({ id: archived.id });
    await client.documents.delete({ id: deleted.id });

    const full = await discoverFull(client, null);

    expect(ids(full.documents)).toEqual([kept.id]);
});

test('full pass reports Outline’s tree order', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const first = outline.addDocument({ collection: open, title: 'First', createdBy: ana });
    const nested = outline.addDocument({ parent: first, title: 'Nested', createdBy: ana });
    const second = outline.addDocument({ collection: open, title: 'Second', createdBy: ana });

    const { order } = await discoverFull(outline.clientAs(ana), null);

    expect([first.id, nested.id, second.id].map(id => order.get(id))).toEqual([0, 1, 2]);
});

test('incremental: returns documents changed after the cursor with text and revision, and advances the cursor', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read_write' });
    const old = outline.addDocument({ collection: open, title: 'Old', createdBy: ana });
    const client = outline.clientAs(ana);
    const first = await discoverIncremental(client, { cursor: null, knownCollectionIds: [open.id] });
    expect(first.cursor).toBe(old.updatedAt);

    const changed = await client.documents.update({ id: old.id, text: 'new text' });
    const fresh = outline.addDocument({ collection: open, title: 'Fresh', createdBy: ana });
    const next = await discoverIncremental(client, {
        cursor: minutesAfter(changed.updatedAt, 10),
        knownCollectionIds: [open.id],
    });
    expect(next.documents).toEqual([]);

    const later = await discoverIncremental(client, {
        cursor: minutesAfter(old.updatedAt, -10),
        knownCollectionIds: [open.id],
    });
    expect(later.documents.find(document => document.id === old.id)).toMatchObject({ text: 'new text', revision: 2 });
    expect(ids(later.documents)).toEqual([old.id, fresh.id].toSorted());
    expect(later.cursor).toBe(fresh.updatedAt);
});

test('incremental: the 2 minute overlap re-reads a document updated just before the cursor, but not an older one', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const doc = outline.addDocument({ collection: open, title: 'Doc', createdBy: ana });
    const options = (cursor: string) => ({ cursor, knownCollectionIds: [open.id] });
    const client = outline.clientAs(ana);

    const within = await discoverIncremental(client, options(minutesAfter(doc.updatedAt, 1.5)));
    const beyond = await discoverIncremental(client, options(minutesAfter(doc.updatedAt, 3)));

    expect(ids(within.documents)).toEqual([doc.id]);
    expect(beyond.documents).toEqual([]);
});

test('incremental: the cursor never moves backwards and stays when nothing comes back', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const doc = outline.addDocument({ collection: open, title: 'Doc', createdBy: ana });
    const ahead = minutesAfter(doc.updatedAt, 1);

    const result = await discoverIncremental(outline.clientAs(ana), { cursor: ahead, knownCollectionIds: [open.id] });

    expect(result.documents).toHaveLength(1);
    expect(result.cursor).toBe(ahead);
    expect((await discoverIncremental(outline.clientAs(ana), { cursor: null, knownCollectionIds: [] })).cursor).toBe(
        doc.updatedAt,
    );
});

test('incremental: own drafts changed after the cursor are returned, older ones are not', async () => {
    const { outline, ana } = twoPartners();
    const stale = outline.addDocument({ title: 'Stale draft', createdBy: ana, published: false });
    const recent = outline.addDocument({ title: 'Recent draft', createdBy: ana, published: false });

    const result = await discoverIncremental(outline.clientAs(ana), {
        cursor: minutesAfter(stale.updatedAt, 10),
        knownCollectionIds: [],
    });
    const all = await discoverIncremental(outline.clientAs(ana), { cursor: null, knownCollectionIds: [] });

    expect(result.documents).toEqual([]);
    expect(ids(all.documents)).toEqual([stale.id, recent.id].toSorted());
});

test('incremental: a changed document in an unknown collection brings the collection list', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    outline.addDocument({ collection: open, title: 'Doc', createdBy: ana });

    const result = await discoverIncremental(outline.clientAs(ana), { cursor: null, knownCollectionIds: [] });

    expect(result.collections.map(collection => collection.id)).toEqual([open.id]);
});

test('request counts: an unchanged workspace costs 2 requests incrementally and a bounded number in a full pass', async () => {
    const { outline, ana } = twoPartners();
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const doc = outline.addDocument({ collection: open, title: 'Doc', createdBy: ana });
    outline.addDocument({ title: 'Draft', createdBy: ana, published: false });
    const client = outline.clientAs(ana);

    const incremental = await requestsMadeBy(outline, ana, () =>
        discoverIncremental(client, { cursor: minutesAfter(doc.updatedAt, 60), knownCollectionIds: [open.id] }),
    );
    const full = await requestsMadeBy(outline, ana, () => discoverFull(client, doc.updatedAt));

    expect(incremental).toBe(2);
    // collections.list, 2 per collection, drafts, userMemberships, groupMemberships.
    expect(full).toBe(1 + 2 + 1 + 1 + 1);
});
