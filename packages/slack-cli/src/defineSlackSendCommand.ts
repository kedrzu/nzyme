import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { fetchSlackDirectory } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackDirectory } from './formatSlackDirectory.js';
import { formatSlackMessages } from './formatSlackMessages.js';
import type { PostedSlackMessage, PostSlackMessageResult } from './postSlackMessage.js';
import { postSlackMessage } from './postSlackMessage.js';
import { readStdinBody } from './readStdinBody.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';
import {
    DEFAULT_POLL_INTERVAL_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    parseWaitSecondsToMs,
    watchSlackThread,
} from './watchSlackThread.js';

/** Resolved `--poll`/`--timeout` values for `--wait`, in milliseconds. */
interface SlackSendWaitOptions {
    pollIntervalMs: number;
    timeoutMs: number;
}

/**
 * Defines `<prefix> send [target]`: posts one agent message — to a person (a DM is opened for you), to a channel, or as a reply into
 * an existing thread named by `--thread`. The body is standard Markdown, read from stdin so a
 * multi-line message full of backticks never has to survive shell quoting. Every message carries the
 * agent marker in its footer and in the fallback text mobile push notifications read, so nobody takes
 * the agent's words for the developer's; `@channel`, `@here` and `@everyone` are refused, since the
 * token is the developer's and a broadcast would page a whole channel in their name; and an empty body
 * is refused rather than sending a bare footer.
 *
 * `--wait` folds `wait` into the same command, baselined on the ts of the message this command
 * itself just posted — no race is possible, since that baseline is established by the very act that
 * created the thread. Equivalent to `send ... && wait <the printed permalink>`, offered
 * as one command because that is the common case: ask, then block for the answer.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackSendCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackSendCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'send']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Post an agent message, or reply into an existing thread',
            details:
                'The message body is read from stdin, as standard Markdown — not Slack mrkdwn. <target> accepts ' +
                'anything resolveSlackTarget accepts: an ' +
                'id, a permalink, #channel, @handle, an email, or free text. Pass --thread INSTEAD of a target to ' +
                'reply into an existing thread: its permalink already names the channel, so giving both would be ' +
                'two destinations for one message. Prints the permalink of what it posted. Pass --wait to then ' +
                `block for a reply — see \`${prefix} wait\` for the polling/deadline/exit-code behaviour, which this ` +
                'reuses exactly, baselined on the message just posted.',
            examples: [
                ['Message a person', `printf "Question?" | ${prefix} send @kedrzu`],
                [
                    'Reply into an existing thread',
                    `printf "Answer." | ${prefix} send --thread https://…/archives/C0.../p123...`,
                ],
                ['Ask and block for the reply', `printf "Question?" | ${prefix} send @kedrzu --wait`],
            ],
        });

        target = Option.String({ required: false });
        thread = Option.String('--thread', {
            description: 'Permalink of an existing thread to reply into, instead of starting a new message',
        });
        wait = Option.Boolean('--wait', false, {
            description: `After posting, block until the thread gets a reply — see \`${prefix} wait\``,
        });
        poll = Option.String('--poll', String(DEFAULT_POLL_INTERVAL_SECONDS), {
            description: `With --wait, seconds between polls (default ${DEFAULT_POLL_INTERVAL_SECONDS})`,
        });
        timeout = Option.String('--timeout', String(DEFAULT_TIMEOUT_SECONDS), {
            description: `With --wait, seconds to wait before giving up (default ${DEFAULT_TIMEOUT_SECONDS})`,
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            // Exactly one destination. Accepting both would silently discard one of them, and the
            // thread permalink would win over a target the caller believed it was sending to.
            if ((this.target == null) === (this.thread == null)) {
                this.context.stderr.write('Pass either a target or --thread, not both and not neither.\n');
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const waitOptions = this.wait ? this.resolveWaitOptions() : undefined;
            if (this.wait && !waitOptions) {
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const body = await readStdinBody(this.context.stdin);

            const client = await this.createClient();
            const identity = await client.auth.test();
            assert(identity.user_id, 'auth.test succeeded without a user_id in its response');

            const taskLink = await params.taskLink?.();
            const result = await postSlackMessage({
                client,
                target: this.target,
                body,
                ownerId: identity.user_id,
                thread: this.thread,
                taskLink,
            });

            const reportCode = this.report(result);
            if (result.outcome !== 'posted' || !waitOptions) {
                return reportCode;
            }

            return await this.waitForReply(result, waitOptions);
        }

        private resolveWaitOptions(): SlackSendWaitOptions | undefined {
            const pollIntervalMs = parseWaitSecondsToMs(this.poll);
            if (pollIntervalMs == null) {
                this.context.stderr.write(`Invalid --poll: "${this.poll}" (expected a positive number of seconds)\n`);
                return undefined;
            }

            const timeoutMs = parseWaitSecondsToMs(this.timeout);
            if (timeoutMs == null) {
                this.context.stderr.write(
                    `Invalid --timeout: "${this.timeout}" (expected a positive number of seconds)\n`,
                );
                return undefined;
            }

            return { pollIntervalMs, timeoutMs };
        }

        /** Waits on the thread this command itself just posted into, baselined on that message's own
         *  ts — reusing `watchSlackThread` exactly as `wait` does. Takes the ids straight off the
         *  posted message, so a failed permalink lookup still leaves the wait armed. Every Slack call
         *  builds its own client: the wait can outlive the token the posting client carries. */
        private async waitForReply(posted: PostedSlackMessage, options: SlackSendWaitOptions): Promise<SlackExitCode> {
            const result = await watchSlackThread({
                getClient: () => this.createClient(),
                channelId: posted.channelId,
                threadTs: posted.threadTs,
                baselineTs: posted.ts,
                pollIntervalMs: options.pollIntervalMs,
                timeoutMs: options.timeoutMs,
            });

            switch (result.outcome) {
                case 'replied': {
                    const { people } = await fetchSlackDirectory(await this.createClient());
                    for (const block of formatSlackMessages([result.message], { people, omission: { kind: 'none' } })) {
                        this.context.stdout.write(`${block}\n\n`);
                    }
                    return SLACK_EXIT_CODE.SUCCESS;
                }

                case 'timed_out':
                    this.context.stderr.write(`No reply within ${this.timeout}s.\n`);
                    return SLACK_EXIT_CODE.WAIT_TIMED_OUT;

                default:
                    return assertNever(result, 'Unhandled watch Slack thread outcome');
            }
        }

        private report(result: PostSlackMessageResult): SlackExitCode {
            switch (result.outcome) {
                case 'posted':
                    if (result.permalink) {
                        this.context.stdout.write(`${result.permalink}\n`);
                    } else {
                        // The message is in Slack already — only the follow-up permalink lookup failed.
                        // Reporting that as a failure would invite a retry, and a human would get the
                        // same question twice; the channel and ts are enough to find or reply to it.
                        this.context.stderr.write(
                            `Message posted to ${result.channelId} (ts ${result.ts}), but looking up its permalink ` +
                                'failed. It was delivered — do not send it again.\n',
                        );
                    }
                    return SLACK_EXIT_CODE.SUCCESS;

                case 'not_found':
                    this.context.stderr.write(`No channel or person matches "${this.target}".\n`);
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'ambiguous':
                    this.context.stderr.write(`"${this.target}" matches more than one channel or person:\n`);
                    for (const line of formatSlackDirectory(result.candidates)) {
                        this.context.stderr.write(`  ${line}\n`);
                    }
                    this.context.stderr.write('Retry with one of the ids above.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'invalid_thread':
                    this.context.stderr.write(`"${this.thread}" is not a Slack message permalink.\n`);
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'empty_body':
                    this.context.stderr.write('Refusing to send an empty message body.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'broadcast_mention':
                    this.context.stderr.write('Refusing to send a message containing @channel, @here or @everyone.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                default:
                    return assertNever(result, 'Unhandled post Slack message outcome');
            }
        }
    };
}
