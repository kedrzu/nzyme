import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { createMemoryKeychain } from '@nzyme/secrets/__fixtures__/createMemoryKeychain.js';

import { outlineTokenStore } from '../auth/tokens.js';
import { fakeOutline } from '../outline/fakeOutline.js';
import { listAll } from '../outline/listAll.js';
import { findPrivateCollection } from '../sync/syncOnce.js';
import { defineOutlineCommands } from './defineOutlineCommands.js';

const ACCESS_TOKEN = 'ol_at_SECRET-access';
const REFRESH_TOKEN = 'ol_rt_SECRET-refresh';
const CODE = 'auth-code-SECRET';

test('login never prints a token, the authorization code or the PKCE verifier', async () => {
    const outline = stubOutline();
    const keychain = createMemoryKeychain();
    const visits: Promise<unknown>[] = [];
    const repo = await mkdtemp(join(await realpath(tmpdir()), 'outline-login-cmd-'));
    expect((await Bun.$`git init --quiet ${repo}`.nothrow()).exitCode).toBe(0);

    const originalCwd = process.cwd();
    process.chdir(repo);
    let result: { exitCode: number; output: string };
    try {
        result = await run(['outline', 'login'], {
            url: outline.url,
            clientId: 'client-1',
            keychain,
            openBrowser: url => {
                visits.push(fetch(url).then(response => response.text()));
                return Promise.resolve();
            },
        });
        await Promise.all(visits);
    } finally {
        process.chdir(originalCwd);
        outline.stop();
    }

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Logged in to Outline as Ana.');
    // The login really happened, so the secrets below existed while the command ran.
    expect([...keychain.values.values()].join('')).toContain(ACCESS_TOKEN);
    const verifier = outline.tokenRequests[0]?.get('code_verifier') ?? '';
    expect(verifier).not.toBe('');
    for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, CODE, verifier]) {
        expect(result.output).not.toContain(secret);
    }
});

test('share, shares and unshare change and print the direct shares of the document a file is synced with', async () => {
    const world = await sharingWorld();
    try {
        const shared = await world.run(['outline', 'share', 'documents/offer.md', 'BOB@example.test', 'team']);
        expect(shared.exitCode).toBe(0);
        expect(shared.output).toBe('Shared directly with:\n- Bob (read_write)\n- group Team (read_write)\n');

        const unshared = await world.run(['outline', 'unshare', 'documents/offer.md', 'Bob']);
        expect(unshared.output).toBe('Shared directly with:\n- group Team (read_write)\n');
        expect((await world.run(['outline', 'shares', 'documents/offer.md'])).output).toBe(
            'Shared directly with:\n- group Team (read_write)\n',
        );
    } finally {
        await world.close();
    }
});

test('a non-admin shares a document and a collection by full name when Outline hides e-mails', async () => {
    const world = await sharingWorld({ admin: false });
    try {
        const shared = await world.run(['outline', 'share', 'documents/offer.md', 'Bob']);
        expect(shared.exitCode).toBe(0);
        expect(shared.output).toBe('Shared directly with:\n- Bob (read_write)\n');
        expect((await world.run(['outline', 'collection', 'create', 'Knowledge'])).exitCode).toBe(0);
        const collection = await world.run(['outline', 'collection', 'share', 'Knowledge', 'Bob']);
        expect(collection.exitCode).toBe(0);
        expect(collection.output).toContain('- Bob (read_write)\n');
        // An e-mail cannot match a user whose e-mail Outline hides.
        const byEmail = await world.run(['outline', 'share', 'documents/offer.md', 'bob@example.test']);
        expect(byEmail.exitCode).toBe(1);
        for (const output of [shared.output, collection.output, byEmail.output]) {
            expect(output).not.toContain('undefined');
        }
        expect((await world.run(['outline', 'shares', 'documents/offer.md'])).output).not.toContain('undefined');
        expect((await world.run(['outline', 'collection', 'shares', 'Knowledge'])).output).not.toContain('undefined');
    } finally {
        await world.close();
    }
});

test('a name matching nobody, or several, changes nothing; a file not in Outline yet fails before any call', async () => {
    const world = await sharingWorld();
    world.outline.addUser({ name: 'Bob', email: 'bob2@example.test' });
    try {
        const unknown = await world.run(['outline', 'share', 'documents/offer.md', 'team', 'Nobody']);
        expect(unknown.exitCode).toBe(1);
        expect(unknown.output).toContain('No Outline user or group has the name or e-mail "Nobody"');
        const ambiguous = await world.run(['outline', 'share', 'documents/offer.md', 'Bob']);
        expect(ambiguous.output).toContain('More than one Outline user or group is named "Bob"; use an e-mail.');
        expect(world.outline.requests.map(request => request.method)).not.toContain('documents.add_group');

        await writeFile(join(world.repo, 'documents', 'new.md'), '# New\n\nNot sent yet.\n');
        const requests = world.outline.requests.length;
        const unsynced = await world.run(['outline', 'shares', 'documents/new.md']);
        expect(unsynced.exitCode).toBe(1);
        expect(unsynced.output).toContain('documents/new.md is not in Outline yet');
        expect(world.outline.requests.length).toBe(requests);
    } finally {
        await world.close();
    }
});

test('collection create --private makes a private collection sync then fills with root files; a second run creates nothing', async () => {
    const world = await sharingWorld();
    await rm(join(world.repo, 'documents', 'offer.md'));
    try {
        const created = await world.run(['outline', 'collection', 'create', '--private']);
        expect(created.exitCode).toBe(0);
        expect(created.output).toContain('Created the collection "Ana (private)" in documents/ana-private/.\n');
        expect(created.output).toContain(
            'Access to the collection "Ana (private)":\n- only its members, not the whole workspace\n- Ana (admin)\n',
        );
        const creates = world.outline.requests.filter(request => request.method === 'collections.create');
        expect(creates.map(request => request.body)).toEqual([{ name: 'Ana (private)', permission: null }]);

        const client = world.outline.clientAs(world.ana);
        const lookup = await findPrivateCollection(client, user => `${user.name} (private)`);
        const collections = await listAll(page => client.collections.list(page));
        expect(lookup.id).toBe(collections.find(collection => collection.name === 'Ana (private)')?.id ?? 'missing');

        const again = await world.run(['outline', 'collection', 'create', '--private']);
        expect(again.exitCode).toBe(0);
        expect(again.output).toContain(
            'The private collection "Ana (private)" already exists in documents/ana-private/; nothing changed.',
        );
        expect(world.outline.requests.filter(request => request.method === 'collections.create')).toHaveLength(1);

        await writeFile(join(world.repo, 'documents', 'idea.md'), '# Idea\n\nSomething new.\n');
        expect((await world.run(['outline', 'sync'])).exitCode).toBe(0);
        const documents = await listAll(page => client.documents.list(page));
        expect(documents.find(document => document.title === 'Idea')?.collectionId).toBe(lookup.id ?? 'missing');
    } finally {
        await world.close();
    }
});

test('collection create refuses a taken name, makes a members-only collection; share and unshare change who reaches it', async () => {
    const world = await sharingWorld();
    try {
        const taken = await world.run(['outline', 'collection', 'create', ' wiki ']);
        expect(taken.exitCode).toBe(1);
        expect(taken.output).toContain('An Outline collection named "wiki" already exists.');
        expect((await world.run(['outline', 'collection', 'create'])).output).toContain(
            'Give either a collection name or --private.',
        );
        expect(world.outline.requests.map(request => request.method)).not.toContain('collections.create');

        const created = await world.run(['outline', 'collection', 'create', 'Knowledge']);
        expect(created.output).toContain('Created the collection "Knowledge" in documents/knowledge/.\n');
        expect(created.output).toContain('- only its members, not the whole workspace\n');

        const shared = await world.run(['outline', 'collection', 'share', 'Knowledge', '--everyone', 'bob', 'Team']);
        expect(shared.exitCode).toBe(0);
        expect(shared.output).toBe(
            'Access to the collection "Knowledge":\n- everyone in the workspace (read_write)\n' +
                '- Ana (admin)\n- Bob (read_write)\n- group Team (read_write)\n',
        );
        const unshared = await world.run([
            'outline',
            'collection',
            'unshare',
            'documents/knowledge',
            'Bob',
            '--everyone',
        ]);
        expect(unshared.output).toBe(
            'Access to the collection "Knowledge":\n- only its members, not the whole workspace\n' +
                '- Ana (admin)\n- group Team (read_write)\n',
        );
        expect((await world.run(['outline', 'collection', 'shares', 'KNOWLEDGE'])).output).toBe(unshared.output);
        expect((await world.run(['outline', 'collection', 'share', 'Knowledge'])).output).toContain(
            'Name at least one user or group, or give --everyone.',
        );
    } finally {
        await world.close();
    }
});

test('a typo in a person, group or collection name changes nothing', async () => {
    const world = await sharingWorld();
    const ana = world.outline.clientAs(world.ana);
    const mine = await ana.collections.create({ name: 'Mine' });
    await ana.collections.create({ name: 'Twice' });
    await ana.collections.create({ name: 'twice' });
    try {
        const changes = () =>
            world.outline.requests.filter(request =>
                ['collections.update', 'collections.add_user', 'collections.add_group'].includes(request.method),
            );
        const person = await world.run(['outline', 'collection', 'share', 'Mine', '--everyone', 'Team', 'Nobody']);
        expect(person.exitCode).toBe(1);
        expect(person.output).toContain('No Outline user or group has the name or e-mail "Nobody"');
        const collection = await world.run(['outline', 'collection', 'share', 'Mien', 'Bob']);
        expect(collection.output).toContain('No Outline collection you can see is named "Mien".');
        const ambiguous = await world.run(['outline', 'collection', 'share', 'twice', 'Bob']);
        expect(ambiguous.output).toContain('More than one Outline collection is named "twice"; use its folder.');
        const notCollection = await world.run(['outline', 'collection', 'shares', 'documents/offer.md']);
        expect(notCollection.output).toContain('documents/offer.md is not the folder of a synced collection.');
        expect(changes()).toEqual([]);
        expect((await ana.collections.info({ id: mine.id })).permission).toBeNull();
    } finally {
        await world.close();
    }
});

test('from a worktree, document and collection paths are found in the main checkout', async () => {
    const world = await sharingWorld();
    try {
        expect((await world.run(['outline', 'pull'])).exitCode).toBe(0);
        const git = (args: string[]) =>
            Bun.$`git -C ${world.repo} -c user.name=Test -c user.email=test@example.test ${args}`.quiet().nothrow();
        expect((await git(['commit', '--allow-empty', '--quiet', '-m', 'init'])).exitCode).toBe(0);
        const worktree = `${world.repo}-worktree`;
        expect((await git(['worktree', 'add', '--quiet', worktree])).exitCode).toBe(0);
        process.chdir(worktree);

        expect((await world.run(['outline', 'shares', 'documents/offer.md'])).output).toBe(
            'Not shared with anyone directly.\n',
        );
        expect((await world.run(['outline', 'collection', 'shares', 'documents/wiki'])).output).toBe(
            'Access to the collection "Wiki":\n- everyone in the workspace (read_write)\n',
        );
    } finally {
        await world.close();
    }
});

/** A git repo with `documents/offer.md` synced with a document of the fake Outline, served on loopback and logged in as Ana. */
async function sharingWorld({ admin = true }: { admin?: boolean } = {}) {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana', email: 'ana@example.test', isAdmin: admin });
    const bob = outline.addUser({ name: 'Bob', email: 'bob@example.test' });
    outline.addGroup({ name: 'Team', members: [bob] });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    const offer = outline.addDocument({ collection: wiki, title: 'Offer', createdBy: ana });
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            return outline.fetch(request.url, { headers: request.headers, body: await request.text() });
        },
    });
    const url = `http://127.0.0.1:${server.port}`;
    const keychain = createMemoryKeychain();
    await outlineTokenStore({ url, keychain }).write({
        accessToken: ana.token,
        accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
        refreshToken: REFRESH_TOKEN,
    });

    const repo = await mkdtemp(join(await realpath(tmpdir()), 'outline-share-cmd-'));
    expect((await Bun.$`git init --quiet ${repo}`.nothrow()).exitCode).toBe(0);
    await mkdir(join(repo, 'documents'));
    await writeFile(join(repo, 'documents', 'offer.md'), `---\noutline: ${offer.id}\n---\n# Offer\n`);
    const originalCwd = process.cwd();
    process.chdir(repo);
    return {
        outline,
        ana,
        repo,
        run: (args: string[]) => run(args, { url, clientId: 'client-1', keychain }),
        close: () => {
            process.chdir(originalCwd);
            void server.stop(true);
            return Promise.resolve();
        },
    };
}

async function run(args: string[], options: { url: string; clientId: string } & Partial<StubOptions>) {
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    let output = '';
    const collect = (chunk: unknown) => {
        output += String(chunk);
    };
    stdoutStream.on('data', collect);
    stderrStream.on('data', collect);

    const cli = new Cli<CommandContext>({ binaryName: 'test', enableColors: false });
    for (const command of defineOutlineCommands({ ...options, privateCollection: user => `${user.name} (private)` })) {
        cli.register(command);
    }
    // A failing command reports through `onError` and exits the process; the exit throws instead, and clipanion
    // turns that into exit code 1.
    const exit = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
    });
    try {
        const exitCode = await cli.run(args, {
            container: createContainer(),
            stdin: Readable.from(['']),
            stdout: stdoutStream,
            stderr: stderrStream,
            onError: failure => {
                collect(failure instanceof Error ? failure.message : failure);
                return null;
            },
        });
        return { exitCode, output };
    } finally {
        exit.mockRestore();
    }
}

type StubOptions = Pick<Parameters<typeof defineOutlineCommands>[0], 'keychain' | 'openBrowser'>;

/** Outline's authorize page (approving at once), token endpoint and `auth.info`, on a real loopback socket. */
function stubOutline() {
    const tokenRequests: URLSearchParams[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            switch (url.pathname) {
                case '/oauth/authorize': {
                    const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
                    callback.searchParams.set('code', CODE);
                    callback.searchParams.set('state', url.searchParams.get('state') ?? '');
                    return Response.redirect(callback.toString(), 302);
                }
                case '/oauth/token':
                    tokenRequests.push(new URLSearchParams(await request.text()));
                    return Response.json({
                        access_token: ACCESS_TOKEN,
                        refresh_token: REFRESH_TOKEN,
                        expires_in: 3600,
                        token_type: 'Bearer',
                        scope: 'read write',
                    });
                case '/api/auth.info':
                    if (request.headers.get('Authorization') !== `Bearer ${ACCESS_TOKEN}`) {
                        return Response.json({ ok: false, error: 'authentication_required' }, { status: 401 });
                    }
                    return Response.json({
                        data: { user: { id: 'u1', name: 'Ana' }, team: { id: 't1', name: 'Healed' } },
                    });
                default:
                    return new Response('Not found', { status: 404 });
            }
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, tokenRequests, stop: () => void server.stop(true) };
}
