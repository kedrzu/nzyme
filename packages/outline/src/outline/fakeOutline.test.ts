import { expect, test } from 'bun:test';

import { fakeOutline } from './fakeOutline.js';
import type { FakeUser } from './fakeOutline.js';
import { listAll } from './listAll.js';
import type { OutlineFilter } from './OutlineTypes.js';

test('visibility: a private collection and its documents are seen only by members and members of a member group', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const carol = outline.addUser({ name: 'Carol' });
    const dave = outline.addUser({ name: 'Dave' });
    const partners = outline.addGroup({ name: 'Partners', members: [carol] });
    const secret = outline.addCollection({
        name: 'Secret',
        members: [{ user: ana, permission: 'read_write' }],
        groups: [{ group: partners, permission: 'read' }],
    });
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const hidden = outline.addDocument({ collection: secret, title: 'Hidden', createdBy: ana });
    const visible = outline.addDocument({ collection: open, title: 'Visible', createdBy: ana });

    const seenBy = async (user: FakeUser) => {
        const client = outline.clientAs(user);
        const collections = await listAll(page => client.collections.list(page));
        const documents = await listAll(page => client.documents.list(page));
        return {
            collections: collections.map(collection => collection.name).toSorted(),
            documents: documents.map(document => document.id).toSorted(),
        };
    };

    const both = [hidden.id, visible.id].toSorted();
    expect(await seenBy(ana)).toEqual({ collections: ['Open', 'Secret'], documents: both });
    expect(await seenBy(carol)).toEqual({ collections: ['Open', 'Secret'], documents: both });
    expect(await seenBy(bob)).toEqual({ collections: ['Open'], documents: [visible.id] });
    expect(await seenBy(dave)).toEqual({ collections: ['Open'], documents: [visible.id] });
    await expect(outline.clientAs(bob).documents.info({ id: hidden.id })).rejects.toMatchObject({ status: 403 });
});

test('read-only access cannot write', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const open = outline.addCollection({ name: 'Open', permission: 'read' });
    const doc = outline.addDocument({ collection: open, title: 'Offer', createdBy: ana });
    const client = outline.clientAs(bob);

    await expect(client.documents.update({ id: doc.id, text: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(client.documents.create({ title: 'T', collectionId: open.id, publish: true })).rejects.toMatchObject({
        status: 403,
    });
});

test('drafts are listed only when a filter mentions publishedAt, and only for the creator and direct members', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const carol = outline.addUser({ name: 'Carol' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const draft = outline.addDocument({ collection: wiki, title: 'Draft', createdBy: ana, published: false });
    const published = outline.addDocument({ collection: wiki, title: 'Published', createdBy: ana });
    outline.shareDocument({ document: draft, user: bob, permission: 'read' });
    const draftsFilter: OutlineFilter[] = [{ field: 'publishedAt', operator: 'isNull' }];

    const ids = async (user: FakeUser, filters?: OutlineFilter[]) =>
        (await outline.clientAs(user).documents.list({ filters })).data.map(document => document.id);

    expect(await ids(ana)).toEqual([published.id]);
    expect(await ids(ana, draftsFilter)).toEqual([draft.id]);
    expect(await ids(bob, draftsFilter)).toEqual([draft.id]);
    expect(await ids(carol, draftsFilter)).toEqual([]);
    expect((await outline.clientAs(ana).documents.drafts()).data.map(document => document.id)).toEqual([draft.id]);
    expect((await outline.clientAs(bob).documents.drafts()).data).toEqual([]);
});

test('a direct share reaches the shared document and its subtree in a private collection, and appears in userMemberships', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const secret = outline.addCollection({ name: 'Secret', members: [{ user: ana, permission: 'admin' }] });
    const root = outline.addDocument({ collection: secret, title: 'Root', createdBy: ana });
    const child = outline.addDocument({ parent: root, title: 'Child', createdBy: ana });
    const sibling = outline.addDocument({ collection: secret, title: 'Sibling', createdBy: ana });
    await outline.clientAs(ana).documents.addUser({ id: root.id, userId: bob.id, permission: 'read' });
    const client = outline.clientAs(bob);

    const visible = (await client.documents.list()).data.map(document => document.id).toSorted();
    const shared = await client.userMemberships.list();

    expect(visible).toEqual([root.id, child.id].toSorted());
    await expect(client.documents.info({ id: sibling.id })).rejects.toMatchObject({ status: 403 });
    expect(shared.documents.map(document => document.id)).toEqual([root.id]);
    expect(shared.memberships).toMatchObject([{ documentId: root.id, userId: bob.id, permission: 'read' }]);
});

test('a group share gives the group members access, and remove_group takes it away', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const team = outline.addGroup({ name: 'Team', members: [bob] });
    const secret = outline.addCollection({ name: 'Secret', members: [{ user: ana, permission: 'admin' }] });
    const doc = outline.addDocument({ collection: secret, title: 'Doc', createdBy: ana });
    const anaClient = outline.clientAs(ana);

    await anaClient.documents.addGroup({ id: doc.id, groupId: team.id, permission: 'read_write' });
    expect((await outline.clientAs(bob).documents.info({ id: doc.id })).title).toBe('Doc');
    await anaClient.documents.removeGroup({ id: doc.id, groupId: team.id });

    await expect(outline.clientAs(bob).documents.info({ id: doc.id })).rejects.toMatchObject({ status: 403 });
});

test('documents.memberships lists direct user shares and remove_user deletes one', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const doc = outline.addDocument({ collection: wiki, title: 'Doc', createdBy: ana });
    const client = outline.clientAs(ana);
    await client.documents.addUser({ id: doc.id, userId: bob.id, permission: 'read' });
    await client.documents.addUser({ id: doc.id, userId: bob.id, permission: 'read_write' });

    const before = await client.documents.memberships({ id: doc.id });
    await client.documents.removeUser({ id: doc.id, userId: bob.id });
    const after = await client.documents.memberships({ id: doc.id });

    expect(before.memberships).toMatchObject([{ userId: bob.id, permission: 'read_write' }]);
    expect(before.users.map(user => user.name)).toEqual(['Bob']);
    expect(after.memberships).toEqual([]);
});

test('revision rises only when the normalized content changes, and the text goes through the normalizer', async () => {
    const outline = fakeOutline({ normalizeText: text => text.replaceAll(/\s+$/gm, '') });
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const client = outline.clientAs(ana);
    const created = await client.documents.create({ title: 'T', text: 'a   ', collectionId: wiki.id, publish: true });

    const same = await client.documents.update({ id: created.id, text: 'a  ' });
    const changed = await client.documents.update({ id: created.id, text: 'b  ' });

    expect([created.revision, created.text]).toEqual([1, 'a']);
    expect(same.revision).toBe(1);
    expect([changed.revision, changed.text]).toEqual([2, 'b']);
    expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
});

test('updatedAt gt filters to what changed since a point in time', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const old = outline.addDocument({ collection: wiki, title: 'Old', createdBy: ana });
    const touched = outline.addDocument({ collection: wiki, title: 'Touched', createdBy: ana });
    const client = outline.clientAs(ana);

    await client.documents.update({ id: touched.id, title: 'Touched again' });
    const changed = await client.documents.list({
        filters: [{ field: 'updatedAt', operator: 'gt', value: touched.updatedAt }],
    });

    expect(old.updatedAt < touched.updatedAt).toBe(true);
    expect(changed.data.map(document => document.title)).toEqual(['Touched again']);
});

test('archive hides a subtree from the default list and the collection tree, but a filter on archivedAt finds it', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const parent = outline.addDocument({ collection: wiki, title: 'Parent', createdBy: ana });
    const child = outline.addDocument({ parent, title: 'Child', createdBy: ana });
    const client = outline.clientAs(ana);

    const archived = await client.documents.archive({ id: parent.id });

    expect(archived.archivedAt).not.toBeNull();
    expect((await client.documents.list()).data).toEqual([]);
    expect(await client.collections.documents({ id: wiki.id })).toEqual([]);
    const archivedList = await client.documents.list({
        filters: [{ field: 'archivedAt', operator: 'gt', value: '2000-01-01T00:00:00Z' }],
    });
    expect(archivedList.data.map(document => document.id).toSorted()).toEqual([parent.id, child.id].toSorted());
});

test('delete removes the document everywhere', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const doc = outline.addDocument({ collection: wiki, title: 'Doc', createdBy: ana });
    const client = outline.clientAs(ana);

    await client.documents.delete({ id: doc.id });

    await expect(client.documents.info({ id: doc.id })).rejects.toMatchObject({ status: 404 });
    expect((await client.documents.list()).data).toEqual([]);
});

test('create, publish a draft, move with an index: the collection tree follows', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const other = outline.addCollection({ name: 'Other', permission: 'read_write' });
    const client = outline.clientAs(ana);
    const a = await client.documents.create({ title: 'A', collectionId: wiki.id, publish: true });
    const b = await client.documents.create({ title: 'B', collectionId: wiki.id, publish: true });
    const draft = await client.documents.create({ title: 'Draft', collectionId: wiki.id });
    expect(draft.publishedAt).toBeNull();
    expect((await client.collections.documents({ id: wiki.id })).map(node => node.title)).toEqual(['A', 'B']);

    await client.documents.update({ id: draft.id, publish: true });
    await client.documents.move({ id: draft.id, collectionId: wiki.id, index: 0 });
    expect((await client.collections.documents({ id: wiki.id })).map(node => node.title)).toEqual(['Draft', 'A', 'B']);
    await client.documents.move({ id: b.id, parentDocumentId: a.id });
    const moved = await client.documents.move({ id: a.id, collectionId: other.id });

    expect((await client.collections.documents({ id: wiki.id })).map(node => node.title)).toEqual(['Draft']);
    const tree = await client.collections.documents({ id: other.id });
    expect(tree.map(node => [node.title, node.children.map(child => child.title)])).toEqual([['A', ['B']]]);
    expect(moved.documents.map(document => document.collectionId)).toEqual([other.id, other.id]);
});

test('publishing needs a collection', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const client = outline.clientAs(ana);

    await expect(client.documents.create({ title: 'T', publish: true })).rejects.toMatchObject({ status: 400 });
});

test('users.list filters by query and emails, groups.list lists groups, auth.info names the caller', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana Nowak', email: 'ana@healed.test' });
    outline.addUser({ name: 'Bob', email: 'bob@healed.test' });
    outline.addGroup({ name: 'Partners', members: [ana] });
    const client = outline.clientAs(ana);

    expect((await client.users.list({ query: 'nowak' })).data.map(user => user.name)).toEqual(['Ana Nowak']);
    expect((await client.users.list({ emails: ['bob@healed.test'] })).data.map(user => user.name)).toEqual(['Bob']);
    expect((await client.groups.list()).data).toMatchObject([{ name: 'Partners', memberCount: 1 }]);
    expect((await client.auth.info()).user.id).toBe(ana.id);
});

test('an unknown token is a 401, and fetchAs overrides whatever token the caller sends', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const request = { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' };

    const anonymous = await outline.fetch(`${outline.url}/api/auth.info`, request);
    const impersonated = await outline.fetchAs(ana)(`${outline.url}/api/auth.info`, request);

    expect(anonymous.status).toBe(401);
    expect(impersonated.status).toBe(200);
});

test('limit above 100 is rejected like the real API', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });

    await expect(outline.clientAs(ana).documents.list({ limit: 101 })).rejects.toMatchObject({ status: 400 });
});
