import { PassThrough, Readable } from 'node:stream';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { afterEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { defineLinearQueryCommand } from './LinearQueryCommand.js';

const FAKE_TOKEN = 'lin_api_must-never-be-printed';
const originalFetch = globalThis.fetch;

interface RecordedRequest {
    url: string;
    headers: Record<string, string>;
    body: unknown;
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('success prints exactly the compact data as one line, and sends the token in the header only', async () => {
    const requests = stubFetch(Response.json({ data: { viewer: { name: 'Ada', tags: [1, 2] } } }));

    const result = await runQuery(['{ viewer { name } }']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${JSON.stringify({ viewer: { name: 'Ada', tags: [1, 2] } })}\n`);
    expect(result.stderr).toBe('');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.linear.app/graphql');
    expect(requests[0]?.headers.authorization).toBe(FAKE_TOKEN);
    expect(requests[0]?.headers['content-type']).toBe('application/json');
    expect(requests[0]?.body).toEqual({ query: '{ viewer { name } }' });
});

test('--vars are sent as variables', async () => {
    const requests = stubFetch(Response.json({ data: { issue: null } }));

    await runQuery(['query($id: String!) { issue(id: $id) { id } }', '--vars', '{"id":"HLD-1"}']);

    expect(requests[0]?.body).toEqual({
        query: 'query($id: String!) { issue(id: $id) { id } }',
        variables: { id: 'HLD-1' },
    });
});

test('invalid --vars exits non-zero without sending a request', async () => {
    const requests = stubFetch(Response.json({ data: {} }));

    for (const vars of ['{not json', '[1]', '"text"']) {
        const result = await runQuery(['{ viewer { id } }', '--vars', vars]);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('--vars');
    }
    expect(requests).toHaveLength(0);
});

test('`-` reads the query from stdin', async () => {
    const requests = stubFetch(Response.json({ data: { ok: true } }));

    const result = await runQuery(['-'], 'query {\n  viewer { name }\n}\n');

    expect(result.exitCode).toBe(0);
    expect(requests[0]?.body).toEqual({ query: 'query {\n  viewer { name }\n}\n' });
});

test('GraphQL errors exit 1 with Linear messages on stderr and nothing on stdout', async () => {
    stubFetch(Response.json({ errors: [{ message: 'Cannot query field "x"' }, { message: 'Second problem' }] }));

    const result = await runQuery(['{ x }']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Cannot query field "x"\nSecond problem');
});

test('errors next to partial data still exit 1, and stderr says the data is partial', async () => {
    stubFetch(Response.json({ data: { issue: null }, errors: [{ message: 'Entity not found' }] }));

    const result = await runQuery(['{ issue(id: "x") { id } }']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Entity not found');
    expect(result.stderr).toContain('partial data');
});

test('an HTTP 400 with GraphQL errors reports those messages', async () => {
    stubFetch(Response.json({ errors: [{ message: 'Syntax Error' }] }, { status: 400 }));

    const result = await runQuery(['{']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Syntax Error');
});

test('HTTP failures are never success: 500 and 401, with a JSON body or without', async () => {
    const failures = [
        new Response('upstream exploded', { status: 500 }),
        Response.json({ data: { viewer: { name: 'looks fine' } } }, { status: 401 }),
        Response.json({}, { status: 401 }),
    ];

    for (const failure of failures) {
        stubFetch(failure);

        const result = await runQuery(['{ viewer { name } }']);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('HTTP');
    }
});

test('a 200 with a non-JSON body is not success', async () => {
    stubFetch(new Response('<html>gateway</html>', { status: 200 }));

    const result = await runQuery(['{ viewer { name } }']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('non-JSON');
});

test('a network error exits 1', async () => {
    globalThis.fetch = Object.assign(() => Promise.reject(new Error('connect ECONNREFUSED')), {
        preconnect: originalFetch.preconnect,
    });

    const result = await runQuery(['{ viewer { name } }']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('ECONNREFUSED');
});

test('the token never reaches stdout or stderr, on success or failure', async () => {
    const responses = [
        Response.json({ data: { a: 1 } }),
        Response.json({ errors: [{ message: 'nope' }] }),
        new Response('x', { status: 500 }),
    ];

    for (const response of responses) {
        stubFetch(response);

        const result = await runQuery(['{ a }']);

        expect(result.stdout).not.toContain(FAKE_TOKEN);
        expect(result.stderr).not.toContain(FAKE_TOKEN);
    }
});

function stubFetch(response: Response): RecordedRequest[] {
    const requests: RecordedRequest[] = [];
    globalThis.fetch = Object.assign(
        (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            requests.push({
                url: typeof input === 'string' ? input : '',
                headers: Object.fromEntries(headers.entries()),
                body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
            });
            return Promise.resolve(response);
        },
        { preconnect: originalFetch.preconnect },
    );
    return requests;
}

async function runQuery(args: string[], stdin = '') {
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

    const container = createContainer();

    const cli = new Cli<CommandContext>({ binaryName: 'healed', enableColors: false });
    cli.register(defineLinearQueryCommand({ prefix: 'linear', linear: { apiToken: FAKE_TOKEN } }));

    const exitCode = await cli.run(['linear', 'query', ...args], {
        container,
        stdin: Readable.from([stdin]),
        stdout: stdoutStream,
        stderr: stderrStream,
    });
    return { exitCode, stdout, stderr };
}
