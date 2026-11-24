import { WebAPIHTTPError, WebAPIPlatformError, WebAPIRequestError } from '@slack/web-api';
import { describe, expect, test } from 'bun:test';

import { defineSecret } from '@nzyme/secrets/defineSecret.js';

import { resolveSlackFailure, SLACK_EXIT_CODE } from './slackExitCodes.js';
import { SlackSignInRequiredError } from './SlackSignInRequiredError.js';

/** The values a product configures; the remedies must name them. */
const AUTH = { token: defineSecret('SLACK_TOKEN'), signInCommand: 'bun healed slack auth' };

describe('resolveSlackFailure', () => {
    describe('caller-fault Slack rejections', () => {
        test.each([
            'not_in_channel',
            'channel_not_found',
            'user_not_found',
            'is_archived',
            'message_not_found',
            'thread_not_found',
            'cant_update_message',
            'edit_window_closed',
        ])('%s maps to INVALID_ARGUMENTS with a remedy, not the token check', slackErrorCode => {
            const failure = resolveSlackFailure(new WebAPIPlatformError({ ok: false, error: slackErrorCode }), AUTH);

            expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.INVALID_ARGUMENTS);
            expect(failure?.message).toContain(slackErrorCode);
            expect(failure?.message).not.toContain('SLACK_TOKEN');
        });

        test('not_in_channel tells the caller to join the channel, not to check their token', () => {
            const failure = resolveSlackFailure(new WebAPIPlatformError({ ok: false, error: 'not_in_channel' }), AUTH);

            expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.INVALID_ARGUMENTS);
            expect(failure?.message).toContain('join');
        });
    });

    describe('genuine token/auth failures', () => {
        test.each(['invalid_auth', 'not_authed', 'token_revoked', 'missing_scope'])(
            '%s keeps the UNAVAILABLE exit code and the token-check remedy',
            slackErrorCode => {
                const failure = resolveSlackFailure(
                    new WebAPIPlatformError({ ok: false, error: slackErrorCode }),
                    AUTH,
                );

                expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
                expect(failure?.message).toContain(slackErrorCode);
                expect(failure?.message).toContain('SLACK_TOKEN');
            },
        );
    });

    test('token_expired tells the caller to sign in again', () => {
        const failure = resolveSlackFailure(new WebAPIPlatformError({ ok: false, error: 'token_expired' }), AUTH);

        expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
        expect(failure?.message).toContain('bun healed slack auth');
    });

    test('an unrecognised platform error code keeps the default token-check remedy', () => {
        const failure = resolveSlackFailure(
            new WebAPIPlatformError({ ok: false, error: 'some_future_slack_error' }),
            AUTH,
        );

        expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
        expect(failure?.message).toContain('some_future_slack_error');
        expect(failure?.message).toContain('SLACK_TOKEN');
    });

    test('an unreachable Slack API keeps reporting UNAVAILABLE', () => {
        const failure = resolveSlackFailure(new WebAPIHTTPError(503, 'Service Unavailable', {}), AUTH);

        expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
    });

    test('a request-level failure keeps reporting UNAVAILABLE', () => {
        const failure = resolveSlackFailure(new WebAPIRequestError(new Error('getaddrinfo ENOTFOUND slack.com')), AUTH);

        expect(failure?.exitCode).toBe(SLACK_EXIT_CODE.UNAVAILABLE);
    });

    test('a sign-in the auth asks for is reported as UNAVAILABLE with its own message', () => {
        const failure = resolveSlackFailure(
            new SlackSignInRequiredError('No Slack sign-in is stored', 'bun healed slack auth'),
            AUTH,
        );

        expect(failure).toEqual({
            exitCode: SLACK_EXIT_CODE.UNAVAILABLE,
            message: 'No Slack sign-in is stored — run `bun healed slack auth`, then retry',
        });
    });

    test('an unrecognised error returns null so the caller can rethrow it', () => {
        expect(resolveSlackFailure(new Error('unrelated bug'), AUTH)).toBeNull();
    });
});
