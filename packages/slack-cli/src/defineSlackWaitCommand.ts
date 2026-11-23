import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { compareSlackTimestamps } from '@nzyme/slack/utils/compareSlackTimestamps.js';
import { fetchSlackDirectory } from '@nzyme/slack/utils/fetchSlackDirectory.js';
import { parseSlackPermalink } from '@nzyme/slack/utils/parseSlackPermalink.js';

import { formatSlackMessages } from './formatSlackMessages.js';
import type { SlackReadClient } from './readSlackConversation.js';
import type { SlackTimestampedMessage } from './selectMessagesAfter.js';
import { selectOwnMessageBaseline } from './selectMessagesAfter.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';
import type { WatchSlackThreadResult } from './watchSlackThread.js';
import {
    DEFAULT_POLL_INTERVAL_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    parseWaitSecondsToMs,
    watchSlackThread,
} from './watchSlackThread.js';

const SLACK_TIMESTAMP_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Defines `<prefix> wait <permalink>`: blocks until a thread gets a reply, or the deadline elapses. The other half of `send --wait`: this
 * is what a standalone re-arm uses to pick up a question the agent asked in an earlier session.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackWaitCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackWaitCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'wait']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Block until a thread gets a reply, or the deadline elapses',
            details:
                'Takes the permalink of a thread, typically what `send` just printed. Polls conversations.replies ' +
                `every --poll seconds (default ${DEFAULT_POLL_INTERVAL_SECONDS}) for anything posted after the ` +
                `baseline, up to --timeout seconds (default ${DEFAULT_TIMEOUT_SECONDS}, 8h). Without --after, the ` +
                "baseline is the last message the tool itself posted into the thread — never the thread's opening " +
                'message — so re-arming a wait after a restart never mistakes a follow-up the agent already sent ' +
                'for the reply that is still pending. A reply is anything posted after the baseline, including one ' +
                'you type yourself directly in Slack: that is how you steer a conversation your agent is having. ' +
                'Exits 0 and prints the reply when one arrives, 2 if the deadline elapses with none, 1 on a fatal ' +
                'failure such as a revoked token — a dropped connection or a sleeping laptop never ends the wait.',
            examples: [
                ['Wait on a thread `send` just started', `${prefix} wait https://…/archives/C0.../p123...`],
                [
                    'Wait from a known baseline, polling fast for a short time',
                    `${prefix} wait <permalink> --after 1700000000.000000 --poll 5 --timeout 600`,
                ],
            ],
        });

        target = Option.String();
        after = Option.String('--after', {
            description: "Baseline ts already observed by the caller, instead of the thread's last tool-posted message",
        });
        poll = Option.String('--poll', String(DEFAULT_POLL_INTERVAL_SECONDS), {
            description: `Seconds between polls (default ${DEFAULT_POLL_INTERVAL_SECONDS})`,
        });
        timeout = Option.String('--timeout', String(DEFAULT_TIMEOUT_SECONDS), {
            description: `Seconds to wait before giving up (default ${DEFAULT_TIMEOUT_SECONDS})`,
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const parsed = parseSlackPermalink(this.target);
            if (!parsed) {
                this.context.stderr.write(`"${this.target}" is not a Slack message permalink.\n`);
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const pollIntervalMs = parseWaitSecondsToMs(this.poll);
            if (pollIntervalMs == null) {
                this.context.stderr.write(`Invalid --poll: "${this.poll}" (expected a positive number of seconds)\n`);
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const timeoutMs = parseWaitSecondsToMs(this.timeout);
            if (timeoutMs == null) {
                this.context.stderr.write(
                    `Invalid --timeout: "${this.timeout}" (expected a positive number of seconds)\n`,
                );
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            if (this.after != null && !SLACK_TIMESTAMP_PATTERN.test(this.after)) {
                this.context.stderr.write(
                    `Invalid --after: "${this.after}" (expected a Slack ts, e.g. 1700000000.000000)\n`,
                );
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const client = await this.createClient();
            const threadTs = parsed.threadTs ?? parsed.ts;
            const baselineTs =
                this.after ??
                (await resolveOwnMessageBaseline({
                    client,
                    channelId: parsed.channelId,
                    threadTs,
                    floorTs: parsed.ts,
                }));

            // Every Slack call from here on builds its own client: the wait can outlive the token `client`
            // carries, so it is not reused once the wait starts.
            const result = await watchSlackThread({
                getClient: () => this.createClient(),
                channelId: parsed.channelId,
                threadTs,
                baselineTs,
                pollIntervalMs,
                timeoutMs,
            });

            return await this.report(result);
        }

        private async report(result: WatchSlackThreadResult): Promise<SlackExitCode> {
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
    };
}

interface ResolveOwnMessageBaselineParams {
    client: SlackReadClient;
    channelId: string;
    threadTs: string;
    /** ts of the message the caller's permalink names. The baseline never resolves earlier than this:
     *  it is the message the caller pointed at, and the one `send` prints is our own by construction. */
    floorTs: string;
}

/**
 * Without `--after`, a re-armed `wait` baselines on the last message in the thread the tool itself
 * posted — see `selectOwnMessageBaseline` for why that is judged by the agent marker, not the Slack
 * author id, and why that is what keeps a re-arm from mistaking an earlier follow-up for the reply.
 *
 * Pages the whole thread rather than reading one page: `conversations.replies` returns messages
 * oldest-first, 100 per page by default, so in a thread longer than a page our own message is not on
 * page 1 at all, the baseline would fall back to the thread root, and the very first poll would hand
 * back a months-old reply as the answer that just arrived. `fetchSlackDirectory` pages for the same
 * reason. The result is then floored at the permalinked message, so even a permalink naming somebody
 * else's reply cannot baseline behind what the caller asked to wait on.
 */
async function resolveOwnMessageBaseline(params: ResolveOwnMessageBaselineParams): Promise<string> {
    const { client, channelId, threadTs, floorTs } = params;

    const messages: SlackTimestampedMessage[] = [];
    let cursor: string | undefined;

    do {
        const response = await client.conversations.replies({
            channel: channelId,
            ts: threadTs,
            cursor,
            // Slack's documented maximum for a cursor-paginated method. The loop follows the cursor
            // regardless; asking for the maximum only keeps the common thread down to one call.
            limit: 999,
        });
        messages.push(...toTimestampedMessages(response.messages ?? []));
        cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    const baselineTs = selectOwnMessageBaseline(messages, threadTs);
    return compareSlackTimestamps(baselineTs, floorTs) > 0 ? baselineTs : floorTs;
}

function toTimestampedMessages(messages: { ts?: string; text?: string }[]): SlackTimestampedMessage[] {
    return messages
        .filter((message): message is { ts: string; text?: string } => message.ts != null)
        .map(message => ({ ts: message.ts, text: message.text }));
}
