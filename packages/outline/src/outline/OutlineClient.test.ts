import { expect, test } from 'bun:test';

import { OutlineApiError, OutlineConflictError, OutlineNetworkError, OutlineRateLimitError } from './errors.js';
import { fakeOutline } from './fakeOutline.js';
import { listAll } from './listAll.js';
import { OutlineClient } from './OutlineClient.js';
import type { OutlineFetch } from './OutlineClient.js';

const TOKEN = 'ol_api_SECRET-token-value';

test('sends a POST with the bearer token from getAccessToken, fetched anew for each call', async () => {
    const seen: { url: string; authorization: string | null; body: unknown }[] = [];
    const fetch: OutlineFetch = (input, init) => {
        seen.push({
            url: input,
            authorization: new Headers(init?.headers).get('Authorization'),
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return Promise.resolve(Response.json({ data: [] }));
    };
    const tokens = ['first', 'second'];
    const client = new OutlineClient({
        url: 'https://wiki.test/',
        getAccessToken: () => Promise.resolve(tokens.shift() ?? ''),
        fetch,
    });

    await client.collections.list();
    await client.documents.list({ limit: 5 });

    expect(seen).toEqual([
        { url: 'https://wiki.test/api/collections.list', authorization: 'Bearer first', body: {} },
        { url: 'https://wiki.test/api/documents.list', authorization: 'Bearer second', body: { limit: 5 } },
    ]);
});

test('a 429 waits Retry-After seconds and retries the same call instead of dropping it', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const slept: number[] = [];
    const client = outline.clientAs(ana, { sleep: recordSleep(slept) });
    outline.injectRateLimit({ times: 2, retryAfterSeconds: 7, method: 'collections.list' });

    const page = await client.collections.list();

    expect(page.data).toEqual([]);
    expect(slept).toEqual([7000, 7000]);
    expect(outline.requests.filter(request => request.method === 'collections.list')).toHaveLength(3);
});

test('a 429 without a usable Retry-After waits one second', async () => {
    let calls = 0;
    const fetch: OutlineFetch = () =>
        Promise.resolve(
            ++calls === 1
                ? Response.json({ ok: false, error: 'rate_limit_exceeded', message: 'slow' }, { status: 429 })
                : Response.json({ data: [] }),
        );
    const slept: number[] = [];
    const client = new OutlineClient({
        url: 'https://wiki.test',
        getAccessToken: () => Promise.resolve(TOKEN),
        fetch,
        sleep: recordSleep(slept),
    });

    await client.groups.list();

    expect(slept).toEqual([1000]);
});

test('a 429 that never clears ends in OutlineRateLimitError, not a silent drop', async () => {
    const fetch: OutlineFetch = () =>
        Promise.resolve(
            Response.json(
                { ok: false, error: 'rate_limit_exceeded', message: 'slow' },
                { status: 429, headers: { 'Retry-After': '1' } },
            ),
        );
    const client = new OutlineClient({
        url: 'https://wiki.test',
        getAccessToken: () => Promise.resolve(TOKEN),
        fetch,
        sleep: () => Promise.resolve(),
    });

    await expect(client.groups.list()).rejects.toBeInstanceOf(OutlineRateLimitError);
});

test('a stale lastRevision surfaces as OutlineConflictError, and the document is left untouched', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const doc = outline.addDocument({ collection: wiki, title: 'Offer', text: 'v1', createdBy: ana });
    const client = outline.clientAs(ana);
    await client.documents.update({ id: doc.id, text: 'v2', lastRevision: doc.revision });

    const stale = client.documents.update({ id: doc.id, text: 'v3', lastRevision: doc.revision });

    await expect(stale).rejects.toBeInstanceOf(OutlineConflictError);
    await expect(stale).rejects.toMatchObject({ status: 409, method: 'documents.update' });
    expect(outline.getDocument(doc.id)?.text).toBe('v2');
});

test('other failures are OutlineApiError with the HTTP status, not conflicts', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const client = outline.clientAs(ana);

    const failure = client.documents.info({ id: crypto.randomUUID() });

    await expect(failure).rejects.toMatchObject({ status: 404, code: 'not_found' });
    await expect(failure).rejects.not.toBeInstanceOf(OutlineConflictError);
});

test('the access token is scrubbed from a server error that echoes it', async () => {
    const fetch: OutlineFetch = () =>
        Promise.resolve(
            Response.json(
                { ok: false, error: 'authentication_required', message: `Invalid token ${TOKEN}` },
                { status: 401 },
            ),
        );
    const client = new OutlineClient({ url: 'https://wiki.test', getAccessToken: () => Promise.resolve(TOKEN), fetch });

    const error = await client.auth.info().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OutlineApiError);
    expect(describeError(error)).not.toContain(TOKEN);
    expect(describeError(error)).toContain('Invalid token');
});

test('the access token is scrubbed from a network failure and from a non-JSON error body', async () => {
    const networkDown: OutlineFetch = (_input, init) =>
        Promise.reject(
            new Error(`connect failed, headers ${JSON.stringify(Object.fromEntries(new Headers(init?.headers)))}`),
        );
    const proxyPage: OutlineFetch = () =>
        Promise.resolve(new Response(`<html>bad gateway for ${TOKEN}</html>`, { status: 502 }));

    const network = await new OutlineClient({
        url: 'https://wiki.test',
        getAccessToken: () => Promise.resolve(TOKEN),
        fetch: networkDown,
    }).auth
        .info()
        .catch((caught: unknown) => caught);
    const proxy = await new OutlineClient({
        url: 'https://wiki.test',
        getAccessToken: () => Promise.resolve(TOKEN),
        fetch: proxyPage,
    }).auth
        .info()
        .catch((caught: unknown) => caught);

    expect(network).toBeInstanceOf(OutlineNetworkError);
    expect(describeError(network)).not.toContain(TOKEN);
    expect(proxy).toBeInstanceOf(OutlineApiError);
    expect(describeError(proxy)).not.toContain(TOKEN);
});

test('listAll walks pages of 100 until a short page', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    for (let index = 0; index < 230; index++) {
        outline.addDocument({ collection: wiki, title: `Doc ${index}`, createdBy: ana });
    }
    const client = outline.clientAs(ana);

    const all = await listAll(page => client.documents.list(page));

    expect(new Set(all.map(document => document.id)).size).toBe(230);
    expect(
        outline.requests.filter(request => request.method === 'documents.list').map(request => request.body),
    ).toEqual([
        { limit: 100, offset: 0 },
        { limit: 100, offset: 100 },
        { limit: 100, offset: 200 },
    ]);
});

test('attachments.redirect resolves to the redirect target', async () => {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const doc = outline.addDocument({ collection: wiki, title: 'Offer', createdBy: ana });
    const client = outline.clientAs(ana);
    const upload = await client.attachments.create({
        name: 'a.png',
        size: 3,
        contentType: 'image/png',
        documentId: doc.id,
    });

    const location = await client.attachments.redirect({ id: upload.attachment.id });

    expect(upload.attachment.url).toBe(`/api/attachments.redirect?id=${upload.attachment.id}`);
    expect(location).toBe(`https://outline.test/files/${upload.attachment.id}/a.png`);
});

function describeError(error: unknown) {
    return error instanceof Error
        ? `${error.name} ${error.message} ${JSON.stringify(error)} ${error.stack ?? ''}`
        : String(error);
}

function recordSleep(slept: number[]) {
    return (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
    };
}
