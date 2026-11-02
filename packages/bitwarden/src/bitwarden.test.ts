import { Buffer } from 'node:buffer';

import { afterEach, expect, test } from 'bun:test';

import type { Keychain } from '@nzyme/secrets/osKeychain.js';

import type {
    BitwardenSecret,
    BitwardenSecretCreateRequest,
    BitwardenSecretUpdateRequest,
    BitwardenSecretsGetRequest,
} from './bitwardenApi.js';
import { bitwarden } from './bitwarden.js';
import type { BitwardenKey } from './bitwardenCrypto.js';
import {
    decryptEncString,
    decryptOrganizationKey,
    encryptEncString,
    parseBitwardenAccessToken,
} from './bitwardenCrypto.js';

const PROJECT = '5b0c2e47-5b2f-4f52-9d5a-0d3c6f0b1a01';
const OTHER_PROJECT = '5b0c2e47-5b2f-4f52-9d5a-0d3c6f0b1a02';
const ORGANIZATION = '0e3a8a1c-7d55-4a3b-9b38-8a2f4c1e9d00';

const servers: { stop(): unknown }[] = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop();
    }
});

test('read logs in with the stored token and costs three requests however many keys', async () => {
    const fake = await startFakeBitwarden();
    await fake.addSecret({ key: 'DB_URL', value: 'postgres://db-secret' });
    await fake.addSecret({ key: 'API_KEY', value: 'api-secret' });
    await fake.addSecret({ key: 'OTHER', value: 'other-secret', project: OTHER_PROJECT });
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    const result = await store.read(['DB_URL', 'API_KEY', 'MISSING', 'OTHER']);

    expect(result).toEqual(
        new Map([
            ['DB_URL', 'postgres://db-secret'],
            ['API_KEY', 'api-secret'],
        ]),
    );
    expect(fake.requests.map(request => request.route)).toEqual([
        'POST /identity/connect/token',
        `GET /api/projects/${PROJECT}/secrets`,
        'POST /api/secrets/get-by-ids',
    ]);
    expect(fake.requests.map(request => request.client)).toEqual(['machine', 'machine', 'machine']);
    fake.expectNoLeak(['postgres://db-secret', 'api-secret']);
});

test('read sends two requests and reads absent keys as absent when none exists', async () => {
    const fake = await startFakeBitwarden();
    await fake.addSecret({ key: 'DB_URL', value: 'postgres://db-secret' });
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    const result = await store.read(['MISSING']);

    expect(result).toEqual(new Map());
    expect(fake.requests.map(request => request.route)).toEqual([
        'POST /identity/connect/token',
        `GET /api/projects/${PROJECT}/secrets`,
    ]);
});

test('write updates with the stored token, keeping the note and the project, and creates in the project', async () => {
    const fake = await startFakeBitwarden();
    const existingId = await fake.addSecret({ key: 'DB_URL', value: 'old-secret', note: 'rotated monthly' });
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    await store.write([
        { key: 'DB_URL', value: 'new-secret' },
        { key: 'API_KEY', value: 'created-secret' },
    ]);

    expect(fake.requests.map(request => request.client)).toEqual([
        'machine',
        'machine',
        'machine',
        'machine',
        'machine',
    ]);
    expect(fake.requests.map(request => request.route)).toEqual([
        'POST /identity/connect/token',
        `GET /api/projects/${PROJECT}/secrets`,
        'POST /api/secrets/get-by-ids',
        `PUT /api/secrets/${existingId}`,
        `POST /api/organizations/${ORGANIZATION}/secrets`,
    ]);
    expect(fake.updates.map(update => update.valueChanged)).toEqual([true]);
    expect(await fake.readSecrets()).toEqual([
        { key: 'DB_URL', value: 'new-secret', note: 'rotated monthly', projects: [PROJECT] },
        { key: 'API_KEY', value: 'created-secret', note: '', projects: [PROJECT] },
    ]);
    fake.expectNoLeak(['new-secret', 'created-secret']);
});

test('write into an empty project creates without fetching', async () => {
    const fake = await startFakeBitwarden();
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    await store.write([{ key: 'API_KEY', value: 'created-secret' }]);

    expect(fake.requests.map(request => request.route)).toEqual([
        'POST /identity/connect/token',
        `GET /api/projects/${PROJECT}/secrets`,
        `POST /api/organizations/${ORGANIZATION}/secrets`,
    ]);
    expect(await fake.readSecrets()).toEqual([
        { key: 'API_KEY', value: 'created-secret', note: '', projects: [PROJECT] },
    ]);
});

test('BWS_ACCESS_TOKEN wins over the keychain for read and write and is a credential env', async () => {
    const fake = await startFakeBitwarden();
    await fake.addSecret({ key: 'DB_URL', value: 'db-secret' });
    const store = bitwarden({
        project: PROJECT,
        server: fake.url,
        keychain: fake.keychain,
        env: { BWS_ACCESS_TOKEN: fake.tokens.env },
    });

    await store.read(['DB_URL']);
    await store.write([{ key: 'DB_URL', value: 'changed-secret' }]);

    expect(store.credentialEnv).toEqual(['BWS_ACCESS_TOKEN']);
    expect(new Set(fake.requests.map(request => request.client))).toEqual(new Set(['env']));
});

test('a keychain token is only sent to the server it was stored for', async () => {
    const stored = await startFakeBitwarden();
    const other = await startFakeBitwarden();
    const keychain = createMemoryKeychain();
    const storedStore = bitwarden({ project: PROJECT, server: stored.url, keychain, env: {} });
    const otherStore = bitwarden({ project: PROJECT, server: other.url, keychain, env: {} });

    await storedStore.login!({ prompt: () => Promise.resolve(stored.tokens.machine) });
    const error = await catchError(otherStore.read(['DB_URL']));

    expect(error.message).toContain('`secrets login`');
    expect(other.requests).toEqual([]);
    expect(await keychain.get(`bitwarden:${new URL(stored.url).host}`)).toBe(stored.tokens.machine);
});

test('login prompts once, proves the token against the server, then stores it for the host', async () => {
    const fake = await startFakeBitwarden();
    const keychain = createMemoryKeychain();
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain, env: {} });
    const prompts: string[] = [];

    await store.login!({
        prompt: label => {
            prompts.push(label);
            return Promise.resolve(fake.tokens.machine);
        },
    });
    const rejected = await catchError(store.login!({ prompt: () => Promise.resolve(fake.tokens.unknown) }));

    expect(prompts).toHaveLength(1);
    expect(fake.requests.map(request => request.client)).toEqual(['machine', 'unknown']);
    expect(await keychain.get(`bitwarden:${new URL(fake.url).host}`)).toBe(fake.tokens.machine);
    expect(rejected.message).toContain('rejected the access token');
    expectNoLeak(rejected, fake.tokens.unknown);
});

test('a missing credential asks to run `secrets login`', async () => {
    const fake = await startFakeBitwarden();
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: createMemoryKeychain(), env: {} });

    const error = await catchError(store.write([]));

    expect(error.message).toContain('`secrets login`');
    expect(fake.requests).toEqual([]);
});

test('a rejected token fails with its own message', async () => {
    const fake = await startFakeBitwarden();
    const store = bitwarden({
        project: PROJECT,
        server: fake.url,
        keychain: fake.keychain,
        env: { BWS_ACCESS_TOKEN: fake.tokens.unknown },
    });

    const error = await catchError(store.read(['DB_URL']));

    expect(error.message).toBe(
        `Bitwarden at ${new URL(fake.url).host} rejected the access token: run \`secrets login\` with a valid one`,
    );
    expectNoLeak(error, fake.tokens.unknown);
});

test('an unreachable server fails with its own message', async () => {
    const fake = await startFakeBitwarden();
    const url = fake.url;
    await fake.stop();
    const store = bitwarden({ project: PROJECT, server: url, keychain: fake.keychain, env: {} });

    const error = await catchError(store.read(['DB_URL']));

    expect(error.message).toBe(`Cannot reach Bitwarden at ${new URL(url).host}: check the server and the network`);
    expectNoLeak(error, fake.tokens.machine);
});

test('a duplicate key in the project fails naming the key, never a value', async () => {
    const fake = await startFakeBitwarden();
    await fake.addSecret({ key: 'DB_URL', value: 'first-secret' });
    await fake.addSecret({ key: 'DB_URL', value: 'second-secret' });
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    const readError = await catchError(store.read(['DB_URL']));
    const writeError = await catchError(store.write([{ key: 'DB_URL', value: 'third-secret' }]));

    expect(readError.message).toBe(
        `Bitwarden project ${PROJECT} has 2 secrets named DB_URL: delete or rename all but one`,
    );
    expect(writeError.message).toBe(readError.message);
    expectNoLeak(readError, 'first-secret', 'second-secret');
    expect(fake.requests.some(request => request.route.startsWith('PUT'))).toBe(false);
});

test('a secret deleted between list and fetch fails with its own message', async () => {
    const fake = await startFakeBitwarden();
    await fake.addSecret({ key: 'DB_URL', value: 'db-secret' });
    await fake.addSecret({ key: 'API_KEY', value: 'api-secret' });
    fake.deleteBeforeFetch('API_KEY');
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });

    const error = await catchError(store.read(['DB_URL', 'API_KEY']));

    expect(error.message).toBe('A Bitwarden secret was deleted while it was being read: try again');
});

test('a value too long for Bitwarden is rejected naming the key before anything is written', async () => {
    const fake = await startFakeBitwarden();
    const store = bitwarden({ project: PROJECT, server: fake.url, keychain: fake.keychain, env: {} });
    const longValue = 'x'.repeat(30000);

    const error = await catchError(
        store.write([
            { key: 'SHORT', value: 'short-secret' },
            { key: 'LONG', value: longValue },
        ]),
    );

    expect(error.message).toMatch(/^Secret LONG is too long for Bitwarden/);
    expect(error.message).not.toContain(longValue.slice(0, 100));
    expect(await fake.readSecrets()).toEqual([]);
});

interface FakeSecret {
    id: string;
    key: string;
    value: string;
    note: string;
    projects: string[];
}

interface FakeRequest {
    route: string;
    url: string;
    /** Which token the request was made with: the one logged in with, or the one behind the bearer. */
    client: string;
    body: string;
}

interface FakeClient {
    client: string;
    secret: string;
    tokenKey: BitwardenKey;
}

interface AddSecretParams {
    key: string;
    value: string;
    note?: string;
    project?: string;
}

/**
 * A Bitwarden server in miniature, behaving as `SecretsController` does: it keeps secrets as
 * EncStrings under a test organization key and issues login responses built with the crypto module.
 */
async function startFakeBitwarden() {
    const organizationKeyBytes = crypto.getRandomValues(new Uint8Array(64));
    const tokens = {
        machine: createAccessToken(),
        env: createAccessToken(),
        unknown: createAccessToken(),
    };
    const clients = new Map<string, FakeClient>();
    for (const [client, token] of Object.entries(tokens)) {
        const { clientId, clientSecret, tokenKey } = await parseBitwardenAccessToken(token);
        clients.set(clientId, { client, secret: clientSecret, tokenKey });
    }

    const { tokenKey } = await parseBitwardenAccessToken(tokens.machine);
    const organizationKey = await decryptOrganizationKey(
        await encryptEncString(
            JSON.stringify({ encryptionKey: Buffer.from(organizationKeyBytes).toString('base64') }),
            tokenKey,
        ),
        tokenKey,
    );
    const sessions = new Map<string, string>();
    const secrets: FakeSecret[] = [];
    const requests: FakeRequest[] = [];
    const updates: BitwardenSecretUpdateRequest[] = [];
    const deletedBeforeFetch = new Set<string>();

    const server = Bun.serve({
        port: 0,
        fetch: handle,
    });
    servers.push(server);

    const keychain = createMemoryKeychain();
    await keychain.set(`bitwarden:${server.url.host}`, tokens.machine);

    return {
        url: server.url.origin,
        tokens,
        keychain,
        requests,
        updates,
        stop: () => server.stop(true),
        addSecret,
        readSecrets,
        deleteBeforeFetch: (key: string) => deletedBeforeFetch.add(key),
        expectNoLeak: expectNoLeakInRequests,
    };

    async function handle(request: Request) {
        const url = new URL(request.url);
        const route = `${request.method} ${url.pathname}`;
        const body = await request.text();
        if (route === 'POST /identity/connect/token') {
            return await login(url, body);
        }

        const client = sessions.get(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');
        requests.push({ route, url: request.url, client: client ?? 'none', body });
        if (client == null) {
            return new Response(null, { status: 401 });
        }

        const [, api, ...segments] = url.pathname.split('/');
        const path = segments.join('/');
        if (api !== 'api') {
            return new Response(null, { status: 404 });
        }

        if (request.method === 'GET' && path === `projects/${PROJECT}/secrets`) {
            return Response.json({
                object: 'SecretsWithProjectsList',
                secrets: secrets
                    .filter(secret => secret.projects.includes(PROJECT))
                    .map(secret => ({ id: secret.id, organizationId: ORGANIZATION, key: secret.key })),
                projects: [],
            });
        }

        if (request.method === 'POST' && path === 'secrets/get-by-ids') {
            await deleteMarked();
            const { ids } = JSON.parse(body) as BitwardenSecretsGetRequest;
            const found = secrets.filter(secret => ids.includes(secret.id));
            if (found.length === 0 || found.length !== ids.length) {
                return new Response(null, { status: 404 });
            }

            return Response.json({ object: 'list', data: found.map(toResponse), continuationToken: null });
        }

        if (request.method === 'POST' && path === `organizations/${ORGANIZATION}/secrets`) {
            const create = JSON.parse(body) as BitwardenSecretCreateRequest;
            const secret = { id: crypto.randomUUID(), ...create, projects: create.projectIds.slice(0, 1) };
            secrets.push(secret);
            return Response.json({ object: 'secret', ...toResponse(secret) });
        }

        const secret = secrets.find(candidate => path === `secrets/${candidate.id}`);
        if (request.method === 'PUT' && secret != null) {
            const update = JSON.parse(body) as BitwardenSecretUpdateRequest;
            updates.push(update);
            Object.assign(secret, { key: update.key, value: update.value, note: update.note });
            // `SecretUpdateRequestModel.ToSecret`: same first project keeps membership, else replaced.
            if (secret.projects[0] !== update.projectIds[0]) {
                secret.projects = update.projectIds.slice(0, 1);
            }

            return Response.json({ object: 'secret', ...toResponse(secret) });
        }

        return new Response(null, { status: 404 });
    }

    async function login(url: URL, body: string) {
        const form = new URLSearchParams(body);
        const match = clients.get(form.get('client_id') ?? '');
        // The form carries the client secret by design, so it is not kept for the leak check.
        requests.push({ route: `POST ${url.pathname}`, url: url.href, client: match?.client ?? 'none', body: '' });
        if (
            match == null ||
            match.client === 'unknown' ||
            match.secret !== form.get('client_secret') ||
            form.get('grant_type') !== 'client_credentials' ||
            form.get('scope') !== 'api.secrets'
        ) {
            return Response.json({ error: 'invalid_client' }, { status: 400 });
        }

        const accessToken = [
            base64Url({ alg: 'none' }),
            base64Url({ organization: ORGANIZATION, jti: crypto.randomUUID() }),
            'signature',
        ].join('.');
        sessions.set(accessToken, match.client);
        const payload = JSON.stringify({ encryptionKey: Buffer.from(organizationKeyBytes).toString('base64') });
        return Response.json({
            access_token: accessToken,
            token_type: 'Bearer',
            encrypted_payload: await encryptEncString(payload, match.tokenKey),
        });
    }

    async function addSecret(params: AddSecretParams) {
        const id = crypto.randomUUID();
        secrets.push({
            id,
            key: await encryptEncString(params.key, organizationKey),
            value: await encryptEncString(params.value, organizationKey),
            note: await encryptEncString(params.note ?? '', organizationKey),
            projects: [params.project ?? PROJECT],
        });
        return id;
    }

    async function readSecrets() {
        const result = [];
        for (const secret of secrets) {
            result.push({
                key: await decryptEncString(secret.key, organizationKey),
                value: await decryptEncString(secret.value, organizationKey),
                note: await decryptEncString(secret.note, organizationKey),
                projects: secret.projects,
            });
        }

        return result;
    }

    async function deleteMarked() {
        const kept: FakeSecret[] = [];
        for (const secret of secrets) {
            if (!deletedBeforeFetch.has(await decryptEncString(secret.key, organizationKey))) {
                kept.push(secret);
            }
        }

        secrets.splice(0, secrets.length, ...kept);
    }

    function toResponse(secret: FakeSecret): BitwardenSecret {
        return {
            id: secret.id,
            organizationId: ORGANIZATION,
            key: secret.key,
            value: secret.value,
            note: secret.note,
            projects: secret.projects.map(id => ({ id })),
        };
    }

    /** No request URL carries a value or token, and no request body a plaintext value. */
    function expectNoLeakInRequests(values: string[]) {
        for (const request of requests) {
            for (const secret of [...values, ...Object.values(tokens), ...sessions.keys()]) {
                expect(request.url).not.toContain(secret);
            }

            for (const value of values) {
                expect(request.body).not.toContain(value);
            }
        }
    }
}

function createAccessToken() {
    const seed = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
    return `0.${crypto.randomUUID()}.${Buffer.from(crypto.getRandomValues(new Uint8Array(15))).toString('base64url')}:${seed}`;
}

function base64Url(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createMemoryKeychain(): Keychain {
    const values = new Map<string, string>();
    return {
        get: name => Promise.resolve(values.get(name) ?? null),
        set: (name, value) => {
            values.set(name, value);
            return Promise.resolve();
        },
        delete: name => Promise.resolve(values.delete(name)),
    };
}

async function catchError(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        if (error instanceof Error) {
            return error;
        }
    }

    throw new Error('Expected the call to fail');
}

function expectNoLeak(error: Error, ...secrets: string[]) {
    for (const secret of secrets) {
        expect(error.message).not.toContain(secret);
    }
}
