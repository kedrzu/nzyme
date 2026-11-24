import { PassThrough, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { loadOpenApiSpec } from '@nzyme/openapi-cli/utils/loadOpenApiSpec.js';
import { renderComponent, renderOperation } from '@nzyme/openapi-cli/utils/renderOpenApiSpec.js';
import { afterEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { defineDiscordCommands } from './defineDiscordCommands.js';

const FAKE_TOKEN = 'secret/bot-token-must-never-be-printed';
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('get sends one request to the Discord API with Bot auth and a DiscordBot user agent, and never prints the token', async () => {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    globalThis.fetch = Object.assign(
        (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            requests.push({
                url: typeof input === 'string' ? input : '',
                headers: Object.fromEntries(new Headers(init?.headers).entries()),
            });
            return Promise.resolve(Response.json([{ id: '1', content: 'hi' }]));
        },
        { preconnect: originalFetch.preconnect },
    );

    const result = await run(['discord', 'get', '/channels/123/messages', '--query', 'limit=20']);

    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://discord.com/api/v10/channels/123/messages?limit=20');
    expect(requests[0]?.headers.authorization).toBe(`Bot ${FAKE_TOKEN}`);
    expect(requests[0]?.headers['user-agent']).toMatch(
        /^DiscordBot \(https:\/\/github\.com\/kedrzu\/nzyme, \d+\.\d+\.\d+\S*\)$/,
    );
    expect(result.stdout + result.stderr).not.toContain(FAKE_TOKEN);
});

test('every operation and component of the committed spec renders', () => {
    const spec = loadOpenApiSpec(fileURLToPath(new URL('../openapi.json', import.meta.url)));

    expect(spec.operations.length).toBeGreaterThan(100);
    for (const operation of spec.operations) {
        expect(renderOperation({ spec, operation, securityScheme: 'BotToken' })).toContain(operation.operationId);
    }
    for (const [name, schema] of Object.entries(spec.schemas)) {
        expect(renderComponent(name, schema)).toStartWith(`${name}:`);
    }
});

async function run(args: string[]) {
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

    const cli = new Cli<CommandContext>({ binaryName: 'test', enableColors: false });
    for (const command of defineDiscordCommands({ prefix: 'discord', botToken: () => FAKE_TOKEN })) {
        cli.register(command);
    }

    const exitCode = await cli.run(args, {
        container: createContainer(),
        stdin: Readable.from(['']),
        stdout: stdoutStream,
        stderr: stderrStream,
    });
    return { exitCode, stdout, stderr };
}
