import { WebAPIPlatformError, WebAPIRequestError } from '@slack/web-api';
import { beforeEach, expect, test } from 'bun:test';

import { ACCESS_TOKEN, fakeSlack, resetFakeSlack, runSlackCommand } from './__fixtures__/slackTestCli.js';

// Every test below proves the access token never reaches stdout/stderr — the regression this guards
// against is a future edit that logs the token, the constructed WebClient, or a raw SDK error object
// for "debugging".

beforeEach(resetFakeSlack);

test('prints the identity and workspace, and passes the token to the client without ever echoing it', async () => {
    const result = await runSlackCommand({ args: ['slack', 'whoami'] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('User: kedrzu (U0APV67CQKT)\nWorkspace: Sigma Health (T0ANWNQ4JR1)\n');
    expect(output(result)).not.toContain(ACCESS_TOKEN);
    expect(fakeSlack.tokens).toEqual([ACCESS_TOKEN]);
});

test('a revoked token produces an actionable message and exit code 1, never the token itself', async () => {
    fakeSlack.authTest = () => Promise.reject(new WebAPIPlatformError({ ok: false, error: 'invalid_auth' }));

    const result = await runSlackCommand({ args: ['slack', 'whoami'] });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('invalid_auth');
    expect(result.stderr).toContain('SLACK_TOKEN');
    expect(output(result)).not.toContain(ACCESS_TOKEN);
    // A stack trace would carry file:line references — absent here because a recognised failure is
    // returned from run(), never thrown.
    expect(output(result)).not.toContain('.ts:');
});

test('an unreachable Slack API produces an actionable message and exit code 1', async () => {
    fakeSlack.authTest = () => Promise.reject(new WebAPIRequestError(new Error('getaddrinfo ENOTFOUND slack.com')));

    const result = await runSlackCommand({ args: ['slack', 'whoami'] });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Could not reach the Slack API');
    expect(output(result)).not.toContain(ACCESS_TOKEN);
});

test('a missing sign-in produces an actionable message instead of a stack trace', async () => {
    const result = await runSlackCommand({ args: ['slack', 'whoami'], stored: {} });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('No Slack sign-in is stored — run `bun healed slack auth`, then retry\n');
    expect(output(result)).not.toContain('.ts:');
    expect(fakeSlack.tokens).toEqual([]);
});

function output(result: { stdout: string; stderr: string; errors: string }) {
    return result.stdout + result.stderr + result.errors;
}
