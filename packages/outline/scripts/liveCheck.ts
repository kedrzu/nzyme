/**
 * Live check of the real Outline API: confirms the assumptions the sync is built on (listing filters, query-less
 * search, drafts, revision and 409, Markdown normalization, OAuth with a loopback redirect, scope, refresh rotation,
 * attachments) before discovery, pull and push are written. Not part of `bun run test`.
 *
 * Opens the browser for the login (click Allow) unless the keychain already holds a login for the workspace.
 * Touches only one private test collection (created if missing) and archives every document it creates;
 * nothing else in the workspace is edited, moved, shared or archived (see `guarded` below). Tokens are never
 * printed or written to the report.
 *
 * Run with: `bun packages/outline/scripts/liveCheck.ts [--collection "OpenSpace test"] [--second-user-email <email>]`
 * The JSON report goes to `packages/outline/.context/live-check-<timestamp>.json` (gitignored).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { login } from '../src/auth/oauth.js';
import { createTokenProvider, LoginRequiredError, outlineTokenStore } from '../src/auth/tokens.js';
import { OutlineClient } from '../src/outline/OutlineClient.js';
import { OutlineApiError, OutlineConflictError } from '../src/outline/errors.js';
import { listAll } from '../src/outline/listAll.js';
import type {
    DocumentsCreateParams,
    DocumentsMoveParams,
    DocumentsUpdateParams,
    OutlineAuthInfo,
    OutlineCollection,
    OutlineNavigationNode,
} from '../src/outline/OutlineTypes.js';
import { acquireLock } from '../src/state/lock.js';

const { values: args } = parseArgs({
    options: {
        url: { type: 'string', default: 'https://healed.getoutline.com' },
        'client-id': { type: 'string', default: 'z12bn0zcn7zeqxufm73z' },
        collection: { type: 'string', default: 'OpenSpace test' },
        'second-user-email': { type: 'string' },
    },
});
const url = (args.url ?? '').replace(/\/+$/, '');
const clientId = args['client-id'] ?? '';
const collectionName = args.collection ?? '';
const secondUserEmail = args['second-user-email'];

type Status = 'PASS' | 'FAIL' | 'INFO';
interface Entry {
    status: Status;
    check: string;
    value: string;
    /** Longer evidence (a diff, a response shape); kept in the report, not printed. */
    detail?: unknown;
}

const report: Entry[] = [];
const startedAt = new Date();

function record(status: Status, check: string, value: unknown, detail?: unknown) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const entry: Entry = { status, check, value: text, detail };
    report.push(entry);
    console.log(`${status} ${check}: ${text.length > 300 ? `${text.slice(0, 300)}...` : text}`);
}

function expectThat(condition: boolean, check: string, value: unknown, detail?: unknown) {
    record(condition ? 'PASS' : 'FAIL', check, value, detail);
}

function describeError(error: unknown) {
    return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

/** Runs one check; a failure is recorded and the run goes on, with `undefined` as the result. */
async function step<T>(check: string, run: () => Promise<T>): Promise<T | undefined> {
    try {
        return await run();
    } catch (error) {
        record('FAIL', check, describeError(error));
        return undefined;
    }
}

function need<T>(value: T | null | undefined, what: string): T {
    if (value == null) {
        throw new Error(`skipped: ${what} is not available`);
    }
    return value;
}

const SAMPLE_BODY = [
    '- bullet with dash',
    '- second bullet',
    '',
    '1. first',
    '2. second',
    '',
    '| Imię | Wartość |',
    '| --- | --- |',
    '| Zażółć | gęślą jaźń |',
    '',
    '**bold stars**, __bold underscores__, *italic star* and _italic underscore_',
    '',
    'hard break after this  ',
    'second line of the same paragraph',
    '',
    'before the empty paragraph',
    '',
    '\\',
    '',
    'after the empty paragraph',
    '',
    '',
    '',
    'after three blank lines',
    '',
    '```ts',
    'const x: number = 1;',
    '```',
    '',
    'A [link](https://example.com/path?a=1) in a paragraph.',
    '',
    '> a blockquote',
    '',
    '--- starts with three dashes',
    '',
    '---',
    '',
    'Zażółć gęślą jaźń, ĄĆĘŁŃÓŚŹŻ.',
    '',
].join('\n');

/** A 1x1 PNG. */
const PNG_BYTES = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    ),
);

/** A line diff of two texts: `-` removed, `+` added, a space for unchanged lines. */
function lineDiff(sent: string, returned: string) {
    const a = sent.split('\n');
    const b = returned.split('\n');
    const width = b.length + 1;
    // lcs[i * width + j]: length of the longest common subsequence of a[i..] and b[j..].
    const lcs = Array.from<number>({ length: (a.length + 1) * width }).fill(0);
    const at = (i: number, j: number) => lcs[i * width + j] ?? 0;
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
        }
    }
    const lines: string[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            lines.push(` ${a[i] ?? ''}`);
            i++;
            j++;
        } else if (j >= b.length || (i < a.length && at(i + 1, j) >= at(i, j + 1))) {
            lines.push(`-${a[i] ?? ''}`);
            i++;
        } else {
            lines.push(`+${b[j] ?? ''}`);
            j++;
        }
    }
    return lines.join('\n');
}

function findNode(nodes: OutlineNavigationNode[], id: string): OutlineNavigationNode | undefined {
    for (const node of nodes) {
        const found = node.id === id ? node : findNode(node.children, id);
        if (found) {
            return found;
        }
    }
    return undefined;
}

const tempDir = await mkdtemp(join(tmpdir(), 'outline-live-check-'));
const lockPath = join(tempDir, 'sync.lock');
const store = outlineTokenStore({ url });
const getAccessToken = createTokenProvider({ url, clientId, store, lock: { kind: 'acquire', path: lockPath } });
const client = new OutlineClient({ url, getAccessToken });

/** Documents this run created. The only ones the script may change, move, share or archive. */
const owned = new Set<string>();
const createdOrder: string[] = [];
let collection: OutlineCollection | null = null;
let shared: { documentId: string; userId: string } | null = null;

/**
 * Every write of the script goes through here, and nothing else calls a mutating client method. A write is
 * refused unless it targets a document created by this run, or lands in the test collection (or under one of
 * our own documents). This is what keeps the real workspace untouched.
 */
const guarded = {
    ownCollectionId() {
        return need(collection, 'the test collection').id;
    },
    ownDocument(id: string) {
        if (!owned.has(id)) {
            throw new Error(`refused: document ${id} was not created by this run`);
        }
        return id;
    },
    async create(params: DocumentsCreateParams) {
        if (params.collectionId !== this.ownCollectionId()) {
            throw new Error('refused: a document must be created in the test collection');
        }
        if (params.parentDocumentId != null) {
            this.ownDocument(params.parentDocumentId);
        }
        const created = await client.documents.create(params);
        owned.add(created.id);
        createdOrder.push(created.id);
        return created;
    },
    update(params: DocumentsUpdateParams) {
        this.ownDocument(params.id);
        if (params.collectionId != null && params.collectionId !== this.ownCollectionId()) {
            throw new Error('refused: update into another collection');
        }
        return client.documents.update(params);
    },
    move(params: DocumentsMoveParams) {
        this.ownDocument(params.id);
        if (params.collectionId !== this.ownCollectionId()) {
            throw new Error('refused: move into another collection');
        }
        if (params.parentDocumentId != null) {
            this.ownDocument(params.parentDocumentId);
        }
        return client.documents.move(params);
    },
    archive(id: string) {
        return client.documents.archive({ id: this.ownDocument(id) });
    },
    addUser(id: string, userId: string) {
        return client.documents.addUser({ id: this.ownDocument(id), userId, permission: 'read_write' });
    },
    removeUser(id: string, userId: string) {
        return client.documents.removeUser({ id: this.ownDocument(id), userId });
    },
    createAttachment(documentId: string) {
        return client.attachments.create({
            name: 'live-check.png',
            size: PNG_BYTES.byteLength,
            contentType: 'image/png',
            documentId: this.ownDocument(documentId),
        });
    },
};

/** The token goes only to the workspace itself, never to a storage host an upload or redirect points at. */
async function authHeadersFor(target: string): Promise<Record<string, string>> {
    return new URL(target, url).origin === new URL(url).origin
        ? { Authorization: `Bearer ${await getAccessToken()}` }
        : {};
}

async function cleanup() {
    if (shared) {
        const { documentId, userId } = shared;
        shared = null;
        await step('cleanup: remove the second user from the document', () => guarded.removeUser(documentId, userId));
    }
    for (const id of createdOrder.toReversed()) {
        if (!owned.has(id)) {
            continue;
        }
        owned.delete(id);
        // `ownDocument` would now refuse, so archive through the client for an id that was ours a line ago.
        await step(`cleanup: archive ${id}`, async () => {
            const archived = await client.documents.archive({ id });
            expectThat(archived.archivedAt != null, `cleanup: archived ${id}`, archived.archivedAt);
        });
    }
}

process.once('SIGINT', () => {
    void cleanup()
        .then(writeReport)
        .finally(() => process.exit(130));
});

async function writeReport() {
    const dir = new URL('../.context/', import.meta.url).pathname;
    await mkdir(dir, { recursive: true });
    const path = join(dir, `live-check-${startedAt.toISOString().replaceAll(':', '-')}.json`);
    const summary = {
        url,
        collection: collectionName,
        secondUserCheck: secondUserEmail != null,
        startedAt: startedAt.toISOString(),
        createdDocumentIds: createdOrder,
        entries: report,
    };
    await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`INFO report: ${path}`);
}

async function loginOrReuse(): Promise<OutlineAuthInfo> {
    const stored = await store.read();
    if (stored != null && !stored.refreshRejected) {
        try {
            const info = await client.auth.info();
            record('INFO', 'login', 'reusing the stored tokens');
            return info;
        } catch (error) {
            if (!(error instanceof LoginRequiredError) && !(error instanceof OutlineApiError)) {
                throw error;
            }
            record('INFO', 'login', `stored tokens unusable (${error.name}), logging in again`);
        }
    }
    record('INFO', 'login', 'opening the browser; click Allow (scope: read write)');
    const info = await login({ url, clientId, store, lockPath });
    record('PASS', 'login', 'logged in, tokens stored in the keychain');
    return info;
}

async function findOrCreateCollection(): Promise<OutlineCollection> {
    const all = await listAll(page => client.collections.list(page));
    const matches = all.filter(candidate => candidate.name === collectionName);
    const [match] = matches;
    if (matches.length > 1) {
        throw new Error(`${matches.length} collections are named exactly "${collectionName}"; refusing to guess`);
    }
    if (match) {
        if (match.permission !== null) {
            throw new Error(
                `the collection "${collectionName}" is not private (permission ${match.permission}); refusing to use it`,
            );
        }
        record('PASS', 'collection', 'found, private');
        return match;
    }
    const made = await client.collections.create({ name: collectionName, permission: null });
    expectThat(made.permission === null, 'collection', `created, permission ${String(made.permission)}`);
    if (made.permission !== null) {
        throw new Error('the new collection is not private; refusing to use it');
    }
    return made;
}

try {
    // 1-2. Login and who we are.
    const me = need(await step('login', loginOrReuse), 'login');
    record('PASS', 'auth.info', { user: me.user.name, team: me.team.name });

    // 3. The private test collection.
    const testCollection = need(await step('collection', findOrCreateCollection), 'the test collection');
    collection = testCollection;
    const inCollection = { field: 'collectionId', operator: 'eq', value: testCollection.id } as const;

    // 4. Create with a body that exercises normalization.
    const created = need(
        await step('documents.create', async () => {
            const made = await guarded.create({
                title: `live-check ${startedAt.toISOString()}`,
                text: SAMPLE_BODY,
                collectionId: testCollection.id,
                publish: true,
            });
            expectThat(made.publishedAt != null, 'documents.create published', made.publishedAt);
            const same = made.text === SAMPLE_BODY;
            record(
                same ? 'PASS' : 'INFO',
                'documents.create text unchanged',
                same ? 'returned text equals sent' : 'returned text differs from sent (normalization, see detail)',
                same ? undefined : { diff: lineDiff(SAMPLE_BODY, made.text), returned: made.text },
            );
            return made;
        }),
        'the created document',
    );
    const canonicalText = created.text;

    // 5. List filtered to the collection.
    await step('documents.list', async () => {
        const items = await listAll(page => client.documents.list({ ...page, filters: [inCollection] }));
        const item = items.find(candidate => candidate.id === created.id);
        record('INFO', 'documents.list items', items.length);
        expectThat(item != null, 'documents.list returns the new document', item != null);
        if (item) {
            expectThat(Object.hasOwn(item, 'text'), 'documents.list items include text', Object.hasOwn(item, 'text'));
            expectThat(
                Object.hasOwn(item, 'revision'),
                'documents.list items include revision',
                Reflect.get(item, 'revision'),
            );
        }
    });

    // 6. Update with the canonical text, then with a real change.
    let current = created;
    let beforeUpdates = created.updatedAt;
    await step('documents.update', async () => {
        beforeUpdates = (await client.documents.info({ id: created.id })).updatedAt;
        const same = await guarded.update({ id: created.id, text: canonicalText, lastRevision: current.revision });
        expectThat(same.revision === current.revision, 'documents.update with the canonical text keeps revision', {
            before: current.revision,
            after: same.revision,
        });
        expectThat(same.text === canonicalText, 'documents.update canonical text stable', same.text === canonicalText);
        current = same;
        const changed = await guarded.update({
            id: created.id,
            text: `${canonicalText}\n\nAppended by the live check.\n`,
            lastRevision: current.revision,
        });
        expectThat(changed.revision === current.revision + 1, 'documents.update with a change bumps revision by 1', {
            before: current.revision,
            after: changed.revision,
        });
        current = changed;
    });

    // 7. Stale lastRevision.
    await step('documents.update stale', async () => {
        try {
            await guarded.update({ id: created.id, text: current.text, lastRevision: current.revision - 1 });
            record('FAIL', 'documents.update with a stale lastRevision', 'accepted, expected 409');
        } catch (error) {
            expectThat(
                error instanceof OutlineConflictError,
                'documents.update with a stale lastRevision is a typed conflict',
                describeError(error),
            );
        }
    });

    // 8. updatedAt filters.
    await step('documents.list updatedAt', async () => {
        const latest = (await client.documents.info({ id: created.id })).updatedAt;
        const ids = async (value: string) =>
            (
                await listAll(page =>
                    client.documents.list({
                        ...page,
                        filters: [inCollection, { field: 'updatedAt', operator: 'gt', value }],
                    }),
                )
            ).map(item => item.id);
        const afterLast = new Date(Date.parse(latest) + 1000).toISOString();
        expectThat(
            (await ids(beforeUpdates)).includes(created.id),
            'updatedAt gt <before the updates> returns the document',
            beforeUpdates,
        );
        expectThat(
            !(await ids(afterLast)).includes(created.id),
            'updatedAt gt <after the last update> does not return it',
            afterLast,
        );
        record(
            'INFO',
            'updatedAt gt <exactly the last updatedAt> returns it',
            (await ids(latest)).includes(created.id),
        );
    });

    // 8b. Query-less documents.search, the quick pass's one request.
    await step('documents.search', async () => {
        const latest = (await client.documents.info({ id: created.id })).updatedAt;
        const search = (value: string) =>
            listAll(page =>
                client.documents.search({
                    ...page,
                    sort: 'updatedAt',
                    direction: 'DESC',
                    filters: [
                        { field: 'archivedAt', operator: 'isNull' },
                        { field: 'updatedAt', operator: 'gt', value },
                    ],
                }),
            );
        const results = await search(beforeUpdates);
        const hit = results.find(result => result.document.id === created.id);
        record('INFO', 'documents.search results', results.length, { keys: results[0] && Object.keys(results[0]) });
        expectThat(
            hit != null,
            'documents.search without a query, updatedAt gt <before the updates> returns the document',
            beforeUpdates,
        );
        if (hit) {
            expectThat(
                hit.document.text === current.text && hit.document.revision === current.revision,
                'documents.search document has the current text and revision',
                hit.document.revision,
            );
        }
        const dates = results.map(result => result.document.updatedAt);
        expectThat(
            dates.every((date, index) => index === 0 || Date.parse(dates[index - 1]!) >= Date.parse(date)),
            'documents.search sorts by updatedAt, newest first',
            dates.slice(0, 5),
        );
        const afterLast = new Date(Date.parse(latest) + 1000).toISOString();
        expectThat(
            !(await search(afterLast)).some(result => result.document.id === created.id),
            'documents.search updatedAt gt <after the last update> does not return it',
            afterLast,
        );
    });

    // 9. Drafts.
    await step('drafts', async () => {
        const draft = await guarded.create({
            title: 'live-check draft',
            text: 'A draft.',
            collectionId: testCollection.id,
        });
        expectThat(draft.publishedAt === null, 'documents.create without publish is a draft', draft.publishedAt);
        const listed = await listAll(page =>
            client.documents.list({
                ...page,
                filters: [inCollection, { field: 'publishedAt', operator: 'isNull' }],
            }),
        );
        expectThat(
            listed.some(item => item.id === draft.id),
            'documents.list with publishedAt isNull returns the draft',
            listed.length,
        );
        const plain = await listAll(page => client.documents.list({ ...page, filters: [inCollection] }));
        record(
            'INFO',
            'documents.list without a publishedAt filter returns the draft',
            plain.some(item => item.id === draft.id),
        );
        const viaDrafts = await listAll(page => client.documents.drafts({ ...page, collectionId: testCollection.id }));
        record(
            'INFO',
            'documents.drafts returns the draft',
            viaDrafts.some(item => item.id === draft.id),
        );
        const published = await guarded.update({ id: draft.id, publish: true, collectionId: testCollection.id });
        expectThat(
            published.publishedAt != null,
            'documents.update publish: true publishes the draft',
            published.publishedAt,
        );
    });

    // 10. Nesting and move.
    await step('child and move', async () => {
        const child = await guarded.create({
            title: 'live-check child',
            text: 'A child.',
            collectionId: testCollection.id,
            parentDocumentId: created.id,
            publish: true,
        });
        const tree = await client.collections.documents({ id: testCollection.id });
        const parentNode = findNode(tree, created.id);
        expectThat(
            parentNode?.children.some(node => node.id === child.id) === true,
            'collections.documents shows the child under its parent',
            child.parentDocumentId,
        );
        await guarded.move({ id: child.id, collectionId: testCollection.id, parentDocumentId: null });
        const after = await client.collections.documents({ id: testCollection.id });
        expectThat(
            after.some(node => node.id === child.id),
            'documents.move to the collection root puts the child at the root of the tree',
            (await client.documents.info({ id: child.id })).parentDocumentId,
        );
    });

    // 11. Document memberships, optionally a share with a second user.
    await step('documents.memberships', async () => {
        const result = await client.documents.memberships({ id: created.id });
        record('INFO', 'documents.memberships shape', {
            keys: Object.keys(result),
            users: result.users.length,
            memberships: result.memberships.length,
        });
    });
    if (secondUserEmail != null) {
        await step('share with a second user', async () => {
            const found = await client.users.list({ emails: [secondUserEmail] });
            const user = need(
                found.data.find(candidate => candidate.email.toLowerCase() === secondUserEmail.toLowerCase()),
                'a user with that email',
            );
            let added = false;
            try {
                await guarded.addUser(created.id, user.id);
                added = true;
                shared = { documentId: created.id, userId: user.id };
                record('PASS', 'documents.add_user with scope read write', 'succeeded');
            } catch (error) {
                record('FAIL', 'documents.add_user with scope read write', describeError(error));
            }
            if (!added) {
                return;
            }
            const after = await client.documents.memberships({ id: created.id });
            expectThat(
                after.memberships.some(membership => membership.userId === user.id),
                'documents.memberships shows the second user',
                after.memberships.length,
            );
            await guarded.removeUser(created.id, user.id);
            shared = null;
            const removed = await client.documents.memberships({ id: created.id });
            expectThat(
                !removed.memberships.some(membership => membership.userId === user.id),
                'documents.remove_user removes the second user',
                removed.memberships.length,
            );
        });
    }

    // 12. userMemberships.list shape.
    await step('userMemberships.list', async () => {
        const result = await client.userMemberships.list({ limit: 10 });
        record('INFO', 'userMemberships.list shape', {
            keys: Object.keys(result),
            memberships: result.memberships.length,
            documents: result.documents.length,
        });
    });

    // 13. Attachment round trip.
    await step('attachment', async () => {
        const upload = await guarded.createAttachment(created.id);
        const attachmentId = upload.attachment.id;
        const form = new FormData();
        for (const [key, value] of Object.entries(upload.form)) {
            form.append(key, value);
        }
        // The file goes last, as S3-style presigned posts require.
        form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'live-check.png');
        const target = new URL(upload.uploadUrl, url).toString();
        const uploaded = await fetch(target, {
            method: 'POST',
            headers: await authHeadersFor(target),
            body: form,
        });
        expectThat(uploaded.ok, 'attachment upload', {
            status: uploaded.status,
            host: new URL(target).host,
            sameOrigin: new URL(target).origin === new URL(url).origin,
            formKeys: Object.keys(upload.form),
        });
        const link = `/api/attachments.redirect?id=${attachmentId}`;
        const latest = await client.documents.info({ id: created.id });
        await guarded.update({
            id: created.id,
            text: `${latest.text}\n\n![x](${link})\n`,
            lastRevision: latest.revision,
        });
        const readBack = await client.documents.info({ id: created.id });
        const imageLines = readBack.text.split('\n').filter(line => line.includes('attachments.redirect'));
        expectThat(readBack.text.includes(`![x](${link})`), 'attachment link is preserved verbatim', imageLines);
        const location = await client.attachments.redirect({ id: attachmentId });
        record('INFO', 'attachments.redirect target', {
            host: new URL(location, url).host,
            sameOrigin: new URL(location, url).origin === new URL(url).origin,
        });
        const target2 = new URL(location, url).toString();
        const bytes = await fetch(target2, { headers: await authHeadersFor(target2) });
        const body = new Uint8Array(await bytes.arrayBuffer());
        expectThat(
            bytes.ok && Buffer.from(body).equals(Buffer.from(PNG_BYTES)),
            'attachment bytes from the redirect match the upload',
            { status: bytes.status, length: body.byteLength, expected: PNG_BYTES.byteLength },
        );
    });

    // 14. Forced refresh and rotation.
    await step('refresh', async () => {
        const before = need(await store.read(), 'stored tokens');
        // The clock stands at the moment the access token expires, so the provider has to refresh.
        const injectedNow = before.accessTokenExpiresAt;
        const forced = createTokenProvider({
            url,
            clientId,
            store,
            lock: { kind: 'acquire', path: lockPath },
            now: () => injectedNow,
        });
        await forced();
        const after = need(await store.read(), 'stored tokens after the refresh');
        expectThat(after.refreshToken !== before.refreshToken, 'refresh rotates the refresh token', {
            rotated: after.refreshToken !== before.refreshToken,
            accessTokenChanged: after.accessToken !== before.accessToken,
        });
        const probe = await new OutlineClient({ url, getAccessToken: forced }).auth.info();
        expectThat(probe.user.id === me.user.id, 'an API call works after the refresh', probe.user.name);
        // The injected clock skewed the stored expiry; put it back on the real clock.
        const lock = await acquireLock(lockPath, { timeoutMs: 30_000 });
        if (lock) {
            try {
                const lifetime = after.accessTokenExpiresAt - injectedNow;
                await store.write({ ...after, accessTokenExpiresAt: Date.now() + lifetime });
            } finally {
                await lock.release();
            }
        }
    });
} catch (error) {
    record('FAIL', 'live check aborted', describeError(error));
} finally {
    // 15. Archive everything this run created, whatever happened above.
    await cleanup();
    await rm(tempDir, { recursive: true, force: true });
    await writeReport();
}
