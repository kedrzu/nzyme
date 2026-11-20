import { expect, test } from 'bun:test';
import { Cli } from 'clipanion';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import type { Keychain } from '@nzyme/secrets/osKeychain.js';

import { defineOutlineCommands } from './defineOutlineCommands.js';

const ACCESS_TOKEN = 'ol_at_SECRET-access';
const REFRESH_TOKEN = 'ol_rt_SECRET-refresh';
const CODE = 'auth-code-SECRET';

test('login never prints a token, the authorization code or the PKCE verifier', async () => {
    const outline = stubOutline();
    const keychain = memoryKeychain();
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
    const exitCode = await cli.run(args, {
        container: createContainer(),
        stdin: Readable.from(['']),
        stdout: stdoutStream,
        stderr: stderrStream,
    });
    return { exitCode, output };
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

function memoryKeychain(): Keychain & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
        values,
        get: name => Promise.resolve(values.get(name) ?? null),
        set: (name, value) => {
            values.set(name, value);
            return Promise.resolve();
        },
        delete: name => Promise.resolve(values.delete(name)),
    };
}
