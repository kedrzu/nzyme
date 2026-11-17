import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { afterEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { defineOpenApiCommands } from './defineOpenApiCommands.js';
import type { OpenApiCommandsOptions } from './defineOpenApiCommands.js';

/** Carries a `/`, which a JSON body may escape as `\/`. */
const FAKE_CREDENTIAL = 'secret/credential-must-never-be-printed';
const originalFetch = globalThis.fetch;

interface RecordedRequest {
    url: string;
    method: string | undefined;
    headers: Record<string, string>;
    body: string | undefined;
    redirect: RequestInit['redirect'];
    signal: AbortSignal | null | undefined;
}

interface RunOptions {
    stdin?: string;
    credential?: () => string;
    /** Overrides the base URL of the `discord` commands. */
    discordBaseUrl?: string;
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('get prints exactly the compact body, sends GET with the configured auth and headers, and never prints the credential', async () => {
    const requests = stubFetch(() => Response.json({ data: [{ id: 1 }], total: 1 }));

    const result = await run(['discord', 'get', '/channels/1/messages']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${JSON.stringify({ data: [{ id: 1 }], total: 1 })}\n`);
    expect(result.stderr).toBe('');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://discord.test/api/v10/channels/1/messages');
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.headers.authorization).toBe(`Bot ${FAKE_CREDENTIAL}`);
    expect(requests[0]?.headers['user-agent']).toBe('DiscordBot (https://example.test, 1)');
    expect(requests[0]?.redirect).toBe('error');
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.body).toBeUndefined();
    expect(result.stdout + result.stderr).not.toContain(FAKE_CREDENTIAL);
});

test('repeated --query values reach the URL, including bracketed keys', async () => {
    const requests = stubFetch(() => Response.json({}));

    await run([
        'drata',
        'get',
        '/workspaces/1/controls',
        '--query',
        'size=5',
        '--query',
        'expand[]=owners',
        '--query',
        'expand[]=tests',
    ]);

    const url = new URL(requests[0]?.url ?? '');
    expect(url.pathname).toBe('/public/v2/workspaces/1/controls');
    expect(url.searchParams.get('size')).toBe('5');
    expect(url.searchParams.getAll('expand[]')).toEqual(['owners', 'tests']);
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${FAKE_CREDENTIAL}`);
});

test('a non-JSON body is printed as text, and an empty one prints nothing', async () => {
    stubFetch(() => new Response('plain text answer'));
    const text = await run(['drata', 'get', '/ping']);

    stubFetch(() => new Response(null, { status: 204 }));
    const empty = await run(['discord', 'write', 'DELETE', '/channels/1/messages/2']);

    expect(text.exitCode).toBe(0);
    expect(text.stdout).toBe('plain text answer\n');
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toBe('');
    expect(empty.stderr).toBe('');
});

test('an HTTP error exits 1 with the message first, the body as indented detail, and no credential anywhere', async () => {
    const escaped = JSON.stringify(FAKE_CREDENTIAL).slice(1, -1).replaceAll('/', '\\/');
    stubFetch(() => new Response(`{"message":"bad token ${FAKE_CREDENTIAL}","echo":"${escaped}"}`, { status: 401 }));

    const result = await run(['discord', 'get', '/channels/9']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const [first, ...detail] = result.stderr.trimEnd().split('\n');
    expect(first).toBe('Discord GET /channels/9 failed: 401');
    expect(detail.length).toBeGreaterThan(0);
    expect(detail.every(line => line.startsWith('    '))).toBe(true);
    expect(detail.join('\n')).toContain('"message": "bad token [redacted]"');
    expect(detail.join('\n')).toContain('"echo": "[redacted]"');
    expect(result.stdout + result.stderr).not.toContain(FAKE_CREDENTIAL);
});

test('a credential echoed in a success body never reaches stdout', async () => {
    const escaped = FAKE_CREDENTIAL.replaceAll('/', '\\/');
    stubFetch(() => new Response(`{"token":"${escaped}"}`));

    const result = await run(['discord', 'get', '/users/@me']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"token":"[redacted]"}\n');
});

test('a network failure exits 1 with the reason and no credential, even when the error message carries it', async () => {
    globalThis.fetch = Object.assign(
        () => Promise.reject(new Error(`connect ECONNREFUSED while sending ${FAKE_CREDENTIAL}`)),
        { preconnect: originalFetch.preconnect },
    );

    const result = await run(['drata', 'get', '/workspaces']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Request to Drata failed: connect ECONNREFUSED while sending [redacted]\n');
});

test('a timeout exits 1 with its own message and no credential', async () => {
    globalThis.fetch = Object.assign(
        () => Promise.reject(new DOMException(`timed out sending ${FAKE_CREDENTIAL}`, 'TimeoutError')),
        { preconnect: originalFetch.preconnect },
    );

    const result = await run(['discord', 'get', '/channels/1']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Request to Discord timed out after 30 s\n');
});

test('a redirect is refused, not followed, so the credential never goes to another location', async () => {
    const hits: string[] = [];
    const server = Bun.serve({
        port: 0,
        fetch(request) {
            const { pathname } = new URL(request.url);
            hits.push(pathname);
            if (pathname === '/api/start') {
                return new Response(null, { status: 302, headers: { Location: '/api/target' } });
            }
            return Response.json({ followed: true });
        },
    });

    try {
        const result = await run(['discord', 'get', '/start'], { discordBaseUrl: `${server.url.origin}/api` });

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toStartWith('Request to Discord failed: ');
        expect(result.stderr).not.toContain(FAKE_CREDENTIAL);
        expect(hits).toEqual(['/api/start']);
    } finally {
        await server.stop(true);
    }
});

test('write sends the method with a JSON body, from --data or stdin', async () => {
    const requests = stubFetch(() => Response.json({ id: 7 }));

    const inline = await run(['drata', 'write', 'POST', '/workspaces/1/things', '--data', '{"name":"x"}']);
    const piped = await run(['drata', 'write', 'patch', '/workspaces/1/things/7', '--data', '-'], {
        stdin: '{"name":"y"}\n',
    });
    const bare = await run(['drata', 'write', 'DELETE', '/workspaces/1/things/7']);

    expect([inline.exitCode, piped.exitCode, bare.exitCode]).toEqual([0, 0, 0]);
    expect(inline.stdout).toBe('{"id":7}\n');
    expect(requests.map(request => request.method)).toEqual(['POST', 'PATCH', 'DELETE']);
    expect(requests.map(request => request.body)).toEqual(['{"name":"x"}', '{"name":"y"}\n', undefined]);
    expect(requests[0]?.headers['content-type']).toBe('application/json');
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${FAKE_CREDENTIAL}`);
    expect(inline.stdout + inline.stderr + piped.stdout + piped.stderr).not.toContain(FAKE_CREDENTIAL);
});

test('usage errors exit 2 without a request or resolving the credential', async () => {
    const requests = stubFetch(() => Response.json({}));

    for (const args of [
        ['drata', 'write', 'GET', '/workspaces'],
        ['drata', 'write', 'HEAD', '/workspaces'],
        ['drata', 'write', 'POST', '/workspaces', '--data', '{not json'],
        ['discord', 'get', 'channels/1'],
        ['discord', 'get', '/channels/1', '--query', 'novalue'],
    ]) {
        const result = await run(args, {
            credential: () => {
                throw new Error('the credential was read');
            },
        });

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toBe('');
    }
    expect(requests).toHaveLength(0);
});

test('an empty credential exits 1 without a request', async () => {
    const requests = stubFetch(() => Response.json({}));

    const result = await run(['discord', 'get', '/channels/1'], { credential: () => '' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('The Discord credential is empty\n');
    expect(requests).toHaveLength(0);
});

test('get has no way to change the method: a method word is just a path and is refused', async () => {
    const requests = stubFetch(() => Response.json({}));

    const result = await run(['drata', 'get', 'POST', '/workspaces']);

    expect(result.exitCode).not.toBe(0);
    expect(requests).toHaveLength(0);
});

test('schema of a tagged spec needs neither the network nor the credential', async () => {
    const options = noNetworkNorCredential();

    const tags = await run(['drata', 'schema'], options);
    const search = await run(['drata', 'schema', '--search', 'notes', '--tag', 'control notes'], options);
    const operation = await run(['drata', 'schema', 'ControlNotes_create'], options);
    const component = await run(['drata', 'schema', 'ControlNote'], options);

    expect(tags.stdout).toBe('Control Notes (2)\nControls (1)\n');
    expect(search.stdout).toBe(
        'ControlNotes_list GET /workspaces/{workspaceId}/controls/{controlId}/notes — List Control Notes\n' +
            'ControlNotes_create POST /workspaces/{workspaceId}/controls/{controlId}/notes — Create Control Note\n',
    );
    expect(operation.stdout).toBe(
        [
            'ControlNotes_create',
            'POST /workspaces/{workspaceId}/controls/{controlId}/notes — Create Control Note',
            'Create a Note for a given Control.',
            'tags: Control Notes',
            'parameters:',
            '  workspaceId path number required',
            '  controlId path number required',
            'body (application/json): ControlNoteCreateRequest',
            '  comment: string',
            '  visibility?: enum(PUBLIC|PRIVATE)?',
            'response 201: ControlNote',
            '',
        ].join('\n'),
    );
    expect(component.stdout).toBe(
        [
            'ControlNote: object',
            '  id: number',
            '  comment: string',
            '  createdAt: string(date-time)',
            '  owner?: User?',
            '',
        ].join('\n'),
    );
    expect([tags, search, operation, component].map(result => result.exitCode)).toEqual([0, 0, 0, 0]);
});

test('schema of an untagged 3.1 spec groups by path segment, merges path-item parameters and renders nullables', async () => {
    const options = noNetworkNorCredential();

    const groups = await run(['discord', 'schema'], options);
    const users = await run(['discord', 'schema', '--tag', 'USERS'], options);
    const list = await run(['discord', 'schema', 'list_messages'], options);
    const create = await run(['discord', 'schema', 'create_message'], options);
    const oauthOnly = await run(['discord', 'schema', 'list_my_connections'], options);
    const either = await run(['discord', 'schema', 'get_my_user'], options);
    const message = await run(['discord', 'schema', 'Message'], options);
    const user = await run(['discord', 'schema', 'User'], options);

    expect(groups.stdout).toBe('channels (2)\nusers (2)\n');
    expect(users.stdout).toBe('get_my_user GET /users/@me\nlist_my_connections GET /users/@me/connections\n');
    expect(list.stdout).toBe(
        [
            'list_messages',
            'GET /channels/{channel_id}/messages',
            'parameters:',
            '  channel_id path Snowflake required',
            '  limit query integer?',
            'response 200: Message[]?',
            '',
        ].join('\n'),
    );
    expect(create.stdout).toBe(
        [
            'create_message',
            'POST /channels/{channel_id}/messages',
            'Posts a message to a channel. The bot needs SEND_MESSAGES.',
            'parameters:',
            '  channel_id path string(snowflake) required',
            'body (application/json): MessageCreateRequest',
            '  content?: string?',
            '  nonce?: integer(int64) | string?',
            'response 200: Message',
            '',
        ].join('\n'),
    );
    expect(oauthOnly.stdout).toContain('\nauth: OAuth2 (not BotToken)\n');
    expect(either.stdout).not.toContain('auth:');
    expect(list.stdout).not.toContain('auth:');
    expect(message.stdout).toBe(
        [
            'Message: object',
            '  id: Snowflake',
            '  content: string',
            '  author?: User?',
            '  embeds?: map[]?',
            '  mentions?: (User | Snowflake)[]',
            '',
        ].join('\n'),
    );
    expect(user.stdout).toContain('  global_name?: string?\n');
});

test('schema names the closest matches for an unknown name and exits 1', async () => {
    const result = await run(['drata', 'schema', 'ControlNotes_creat']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Closest: ControlNotes_create');
});

function noNetworkNorCredential(): RunOptions {
    globalThis.fetch = Object.assign(
        () => {
            throw new Error('network call from the schema command');
        },
        { preconnect: originalFetch.preconnect },
    );
    return {
        credential: () => {
            throw new Error('the credential was read');
        },
    };
}

function stubFetch(makeResponse: () => Response): RecordedRequest[] {
    const requests: RecordedRequest[] = [];
    globalThis.fetch = Object.assign(
        (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            requests.push({
                url: typeof input === 'string' ? input : '',
                method: init?.method,
                headers: Object.fromEntries(new Headers(init?.headers).entries()),
                body: typeof init?.body === 'string' ? init.body : undefined,
                redirect: init?.redirect,
                signal: init?.signal,
            });
            return Promise.resolve(makeResponse());
        },
        { preconnect: originalFetch.preconnect },
    );
    return requests;
}

async function run(args: string[], options: RunOptions = {}) {
    const credential = options.credential ?? (() => FAKE_CREDENTIAL);
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    let stdout = '';
    let stderr = '';
    stdoutStream.on('data', chunk => {
        stdout += String(chunk);
    });
    stderrStream.on('data', chunk => {
        stderr += String(chunk);
    });

    const services: OpenApiCommandsOptions[] = [
        {
            prefix: 'drata',
            service: 'Drata',
            baseUrl: 'https://drata.test/public/v2',
            specPath: fileURLToPath(new URL('./__fixtures__/tagged.json', import.meta.url)),
            authScheme: 'Bearer',
            credential,
        },
        {
            prefix: 'discord',
            service: 'Discord',
            baseUrl: options.discordBaseUrl ?? 'https://discord.test/api/v10',
            specPath: fileURLToPath(new URL('./__fixtures__/untagged.json', import.meta.url)),
            authScheme: 'Bot',
            credential,
            headers: { 'User-Agent': 'DiscordBot (https://example.test, 1)' },
            securityScheme: 'BotToken',
        },
    ];
    const cli = new Cli<CommandContext>({ binaryName: 'test', enableColors: false });
    for (const service of services) {
        for (const command of defineOpenApiCommands(service)) {
            cli.register(command);
        }
    }

    const exitCode = await cli.run(args, {
        container: createContainer(),
        stdin: Readable.from([options.stdin ?? '']),
        stdout: stdoutStream,
        stderr: stderrStream,
    });
    return { exitCode, stdout, stderr };
}
