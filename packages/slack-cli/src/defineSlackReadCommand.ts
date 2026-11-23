import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { fetchSlackDirectory } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackDirectory } from './formatSlackDirectory.js';
import type { SlackMessageRecord, SlackMessagesOmission } from './formatSlackMessages.js';
import { formatSlackMessages } from './formatSlackMessages.js';
import type { ReadSlackConversationResult, SlackReadClient } from './readSlackConversation.js';
import { readSlackConversation } from './readSlackConversation.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

const DEFAULT_LIMIT = 50;

/**
 * Defines `<prefix> read <target>`: reads a channel's recent history, or — given a permalink into a thread — the whole thread. The
 * other half of `search`: once a message is found, this is how the agent reads the conversation
 * around it, at the same fidelity a human would see it (blocks rendered, not just raw `text`).
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackReadCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackReadCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'read']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Read a channel’s recent history, or a whole thread from its permalink',
            details:
                'Accepts a channel (id, #name, or a permalink) or a message permalink. A permalink into a thread ' +
                'reads the whole thread via conversations.replies; anything else reads recent channel history via ' +
                'conversations.history. Either way the output is chronological and ends on the latest message: ' +
                'a result capped by --limit keeps the newest ones and says how many more exist earlier, so a ' +
                'truncated read never reads as the whole conversation.',
            examples: [
                ['Read a thread from its permalink', `${prefix} read https://acme.slack.com/archives/C0.../p123...`],
                ['Read recent history in a channel', `${prefix} read #dev-alerts`],
            ],
        });

        target = Option.String();
        limit = Option.String('--limit,-l', String(DEFAULT_LIMIT), {
            description: `Max messages to print (default ${DEFAULT_LIMIT})`,
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const limit = this.parseLimit(this.limit);
            if (limit == null) {
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const client = await this.createClient();
            const result = await readSlackConversation({ client, target: this.target, limit });
            return await this.report(result, client);
        }

        private async report(result: ReadSlackConversationResult, client: SlackReadClient): Promise<SlackExitCode> {
            switch (result.outcome) {
                case 'not_found':
                    this.context.stderr.write(`No channel or message matches "${this.target}".\n`);
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'ambiguous':
                    this.context.stderr.write(`"${this.target}" matches more than one channel or person:\n`);
                    for (const line of formatSlackDirectory(result.candidates)) {
                        this.context.stderr.write(`  ${line}\n`);
                    }
                    this.context.stderr.write('Retry with one of the ids above.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'unsupported_target':
                    this.context.stderr.write(
                        `"${this.target}" resolved to a ${result.kind}, but read only supports channels and thread ` +
                            'permalinks. Reading a DM needs the channel id, not the person.\n',
                    );
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'read':
                    return await this.reportMessages(result.messages, result.omission, client);

                default:
                    return assertNever(result, 'Unhandled read Slack conversation outcome');
            }
        }

        private async reportMessages(
            messages: SlackMessageRecord[],
            omission: SlackMessagesOmission,
            client: SlackReadClient,
        ): Promise<SlackExitCode> {
            if (messages.length === 0) {
                this.context.stdout.write('No messages found.\n');
                return SLACK_EXIT_CODE.SUCCESS;
            }

            const { people } = await fetchSlackDirectory(client);
            for (const block of formatSlackMessages(messages, { people, omission })) {
                this.context.stdout.write(`${block}\n\n`);
            }
            return SLACK_EXIT_CODE.SUCCESS;
        }
    };
}
