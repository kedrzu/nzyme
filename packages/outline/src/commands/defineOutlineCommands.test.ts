import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { createMemoryKeychain } from '@nzyme/secrets/__fixtures__/createMemoryKeychain.js';

import { outlineTokenStore } from '../auth/tokens.js';
import { fakeOutline } from '../outline/fakeOutline.js';
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
        expect(shared.output).toBe(
            'Shared directly with:\n- Bob <bob@example.test> (read_write)\n- group Team (read_write)\n',
        );

        const unshared = await world.run(['outline', 'unshare', 'documents/offer.md', 'Bob']);
        expect(unshared.output).toBe('Shared directly with:\n- group Team (read_write)\n');
        expect((await world.run(['outline', 'shares', 'documents/offer.md'])).output).toBe(
            'Shared directly with:\n- group Team (read_write)\n',
        );
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

/** A git repo with `documents/offer.md` synced with a document of the fake Outline, served on loopback and logged in as Ana. */
async function sharingWorld() {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana', email: 'ana@example.test' });
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
    for (const command of defineOutlineCommands({ ...options, privateCollection: user => user.name })) {
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
