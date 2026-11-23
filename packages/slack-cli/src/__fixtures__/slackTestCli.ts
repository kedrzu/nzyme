/**
 * The harness of the Slack command tests: a fake Slack Web API client in place of the SDK's
 * `WebClient`, and commands run in-process through clipanion with a real container, a real
 * `defineSlackAuth` and an in-memory store holding the sign-in.
 */
import { PassThrough, Readable } from 'node:stream';

import type { AuthTestResponse, Block, ChatPostMessageArguments, KnownBlock } from '@slack/web-api';
import * as slackWebApi from '@slack/web-api';
import { mock, spyOn } from 'bun:test';
import { Builtins, Cli } from 'clipanion';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore, SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';

import type { SlackCommandsOptions } from '../SlackCommandsOptions.js';

/** Stands in for the developer's access token; no output may ever carry it. */
export const ACCESS_TOKEN = 'xoxe-should-never-leak-into-output';
/** The token secret, under the name a product configures. */
export const SLACK_TOKEN = defineSecret('SLACK_TOKEN');
export const SIGN_IN_COMMAND = 'bun healed slack auth';

/** What the fake Slack answers and what it was asked; reset by {@link resetFakeSlack}. */
export interface FakeSlack {
    /** The token each client was built with. */
    tokens: (string | undefined)[];
    authTest: () => Promise<AuthTestResponse>;
    /** Answers `apiCall`, the call the sign-in's code exchange makes; refuses every call by default. */
    apiCall: (method: string, options: Record<string, unknown>) => Promise<unknown>;
    /** Every `chat.postMessage` call. */
    posted: FakePostedMessage[];
}

/** What a `chat.postMessage` call carried. */
export interface FakePostedMessage {
    channel: string;
    text: string | undefined;
    blocks: (KnownBlock | Block)[] | undefined;
}

export const fakeSlack: FakeSlack = { tokens: [], authTest: answerAuthTest, apiCall: refuseApiCall, posted: [] };

/** The identity `auth.test` reports by default. */
export const IDENTITY = {
    ok: true,
    user: 'kedrzu',
    user_id: 'U0APV67CQKT',
    team: 'Sigma Health',
    team_id: 'T0ANWNQ4JR1',
} satisfies AuthTestResponse;

/** Puts the fake Slack back to its default answers, with nothing recorded. */
export function resetFakeSlack() {
    fakeSlack.tokens = [];
    fakeSlack.authTest = answerAuthTest;
    fakeSlack.apiCall = refuseApiCall;
    fakeSlack.posted = [];
}

class FakeWebClient {
    auth = { test: () => fakeSlack.authTest() };
    apiCall = (method: string, options: Record<string, unknown>) => fakeSlack.apiCall(method, options);
    chat = {
        postMessage: (args: ChatPostMessageArguments) => {
            fakeSlack.posted.push({
                channel: args.channel,
                text: 'text' in args ? args.text : undefined,
                blocks: 'blocks' in args ? args.blocks : undefined,
            });
            return Promise.resolve({ ok: true, ts: '1700000000.000100' });
        },
        getPermalink: () => Promise.resolve({ ok: true, permalink: 'https://acme.slack.com/archives/C0/p1' }),
    };

    constructor(token?: string) {
        fakeSlack.tokens.push(token);
    }
}

// Only `WebClient` is replaced: the error classes stay the SDK's own, so the `instanceof` checks of the
// failure mapping match the errors the tests construct.
await mock.module('@slack/web-api', () => ({ ...slackWebApi, WebClient: FakeWebClient }));

const { defineSlackAuth } = await import('../defineSlackAuth.js');
const { defineSlackCommands } = await import('../defineSlackCommands.js');

/** Options of {@link runSlackCommand}. */
export interface RunSlackCommandOptions {
    args: string[];
    /** What the developer's store holds; a sign-in valid for 12 hours by default. */
    stored?: Record<string, string>;
    /** The token secret; {@link SLACK_TOKEN} by default. */
    token?: SecretDefinition;
    /** The redirect URI of the Slack app; `http://localhost:8760/callback` by default. */
    redirectUri?: string;
    /** The sign-in command the auth names; {@link SIGN_IN_COMMAND} by default. */
    signInCommand?: string;
    /** The CLI's binary name; `healed` by default. */
    binaryName?: string;
    prefix?: string;
    taskLink?: SlackCommandsOptions['taskLink'];
    /** What the command reads from its piped stdin; empty by default. */
    stdin?: string;
}

/** What a command run left behind. */
export interface SlackCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** What was reported through `console.error`: logs and the failure report of an unexpected error. */
    errors: string;
    /** Every write to the developer's store. */
    writes: SecretStoreEntry[][];
}

/** Thrown in place of a real `process.exit`; the base `Command.catch` exits 1 after reporting an error. */
class ProcessExited extends Error {}

/** Runs one command of the Slack set, defined with the given prefix, under the given binary name. */
export async function runSlackCommand(options: RunSlackCommandOptions): Promise<SlackCommandResult> {
    const token = options.token ?? SLACK_TOKEN;
    const memory = createMemoryStore({ id: 'fake:personal', data: options.stored ?? signedIn(token), persist: true });
    const store = defineService<SecretStore>({ name: 'TestSlackStore', setup: () => memory.store });
    const auth = defineSlackAuth({
        store,
        token,
        clientId: 'client-1',
        userScopes: ['search:read', 'chat:write'],
        redirectUri: options.redirectUri ?? 'http://localhost:8760/callback',
        signInCommand: options.signInCommand ?? SIGN_IN_COMMAND,
    });

    // Plain help whatever the environment says: CI sets FORCE_COLOR.
    const cli = new Cli<CommandContext>({ binaryName: options.binaryName ?? 'healed', enableColors: false });
    for (const command of defineSlackCommands({ prefix: options.prefix, auth, taskLink: options.taskLink })) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);

    const container = createContainer();
    container.set(EnvVariables, {});

    let errors = '';
    const exitCodes: (number | string | null | undefined)[] = [];
    const spies = [
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited();
        }),
        spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors += args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
        }),
    ];

    const stdout = collect();
    const stderr = collect();
    try {
        const code = await cli.run(options.args, {
            container,
            stdin: Readable.from([options.stdin ?? '']),
            stdout: stdout.stream,
            stderr: stderr.stream,
        });
        const exited = exitCodes[0];
        return {
            exitCode: typeof exited === 'number' ? exited : code,
            stdout: stdout.text(),
            stderr: stderr.text(),
            errors,
            writes: memory.writes,
        };
    } finally {
        for (const spy of spies) {
            spy.mockRestore();
        }
    }
}

/** The token secret of a sign-in whose access token is {@link ACCESS_TOKEN}, valid for 12 hours. */
export function signedIn(token: SecretDefinition = SLACK_TOKEN): Record<string, string> {
    return {
        [token.name]: JSON.stringify({
            accessToken: ACCESS_TOKEN,
            refreshToken: 'refresh-token-never-used',
            expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        }),
    };
}

function answerAuthTest() {
    return Promise.resolve<AuthTestResponse>(IDENTITY);
}

function refuseApiCall(method: string) {
    return Promise.reject(new slackWebApi.WebAPIPlatformError({ ok: false, error: `unexpected_${method}` }));
}

function collect() {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));

    return { stream, text: () => chunks.join('') };
}
