import { WebAPIPlatformError } from '@slack/web-api';
import { beforeEach, expect, test } from 'bun:test';

import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import type { RunSlackCommandOptions } from './__fixtures__/slackTestCli.js';
import { fakeSlack, resetFakeSlack, runSlackCommand } from './__fixtures__/slackTestCli.js';
import { SLACK_AGENT_MARKER } from './buildSlackFooter.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';

const SESSION = defineSecret('OPENSPACE_SLACK_SESSION');
const SIGN_IN_COMMAND = 'openspace chat auth';
const CHANNEL_ID = 'C0ANMLVNB4P';
const TASK = { id: 'OPS-12', url: 'https://tracker.example.com/OPS-12' };

beforeEach(resetFakeSlack);

test('--help lists every command under the configured binary name and prefix', async () => {
    const result = await openspace({ args: ['--help'] });

    const listed = [...result.stdout.matchAll(/^\s+openspace chat ([a-z]+)\b/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual([
        'auth',
        'channels',
        'edit',
        'people',
        'read',
        'search',
        'send',
        'wait',
        'whoami',
    ]);
    expect(result.stdout).not.toContain(' slack ');
});

test('runs a command under the configured prefix, and not under the default one', async () => {
    const whoami = await openspace({ args: ['chat', 'whoami'] });
    const unprefixed = await openspace({ args: ['slack', 'whoami'] });

    expect(whoami.exitCode).toBe(SLACK_EXIT_CODE.SUCCESS);
    expect(whoami.stdout).toContain('User: kedrzu (U0APV67CQKT)');
    expect(unprefixed.exitCode).not.toBe(SLACK_EXIT_CODE.SUCCESS);
    expect(fakeSlack.tokens).toHaveLength(1);
});

test.each([
    ['nothing is stored', {}, 'No Slack sign-in is stored — run `openspace chat auth`, then retry\n'],
    [
        'Slack refuses the token as expired',
        undefined,
        'Slack rejected the request (token_expired): run `openspace chat auth`, then retry.\n',
    ],
])('the sign-in hint names the configured sign-in command when %s', async (_case, stored, expected) => {
    fakeSlack.authTest = () => Promise.reject(new WebAPIPlatformError({ ok: false, error: 'token_expired' }));

    const result = await openspace({ args: ['chat', 'whoami'], stored });

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
    expect(result.stderr).toBe(expected);
});

test('a token Slack refuses names the configured token secret', async () => {
    fakeSlack.authTest = () => Promise.reject(new WebAPIPlatformError({ ok: false, error: 'invalid_auth' }));

    const result = await openspace({ args: ['chat', 'whoami'] });

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
    expect(result.stderr).toContain('Check that OPENSPACE_SLACK_SESSION is still valid');
    expect(result.stderr).not.toContain('SLACK_TOKEN');
});

test('send marks the message as the agent’s in its text and its footer, and links the task the callback returns', async () => {
    const result = await openspace({
        args: ['chat', 'send', CHANNEL_ID],
        stdin: 'Is the release ready?',
        taskLink: () => Promise.resolve(TASK),
    });

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.SUCCESS);
    expect(fakeSlack.posted).toHaveLength(1);
    const [posted] = fakeSlack.posted;
    expect(posted?.channel).toBe(CHANNEL_ID);
    expect(posted?.text).toBe(`${SLACK_AGENT_MARKER} <@U0APV67CQKT>\nIs the release ready?`);
    expect(posted?.blocks?.at(-1)).toEqual(
        footer(
            `${SLACK_AGENT_MARKER} <@U0APV67CQKT> · Reply in this thread, that is the only place the agent reads. · ` +
                '<https://tracker.example.com/OPS-12|OPS-12>',
        ),
    );
});

test.each([
    ['no task callback is configured', undefined],
    ['the callback finds no task', () => Promise.resolve(undefined)],
])('send links no task when %s', async (_case, taskLink: RunSlackCommandOptions['taskLink']) => {
    const result = await openspace({ args: ['chat', 'send', CHANNEL_ID], stdin: 'Is the release ready?', taskLink });

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.SUCCESS);
    expect(fakeSlack.posted).toHaveLength(1);
    expect(fakeSlack.posted[0]?.blocks?.at(-1)).toEqual(
        footer(`${SLACK_AGENT_MARKER} <@U0APV67CQKT> · Reply in this thread, that is the only place the agent reads.`),
    );
});

test.each(['@channel', '@here', '@everyone'])('send refuses a body mentioning %s and posts nothing', async mention => {
    const result = await openspace({ args: ['chat', 'send', CHANNEL_ID], stdin: `Heads up ${mention}` });

    expect(result.exitCode).toBe(SLACK_EXIT_CODE.INVALID_ARGUMENTS);
    expect(result.stderr).toBe('Refusing to send a message containing @channel, @here or @everyone.\n');
    expect(fakeSlack.posted).toEqual([]);
});

/** Runs a command of the set as a second product defines it: binary `openspace`, prefix `chat`. */
function openspace(options: RunSlackCommandOptions) {
    return runSlackCommand({
        binaryName: 'openspace',
        prefix: 'chat',
        token: SESSION,
        signInCommand: SIGN_IN_COMMAND,
        ...options,
    });
}

/** The footer block of a message, with this text. */
function footer(text: string) {
    return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}
