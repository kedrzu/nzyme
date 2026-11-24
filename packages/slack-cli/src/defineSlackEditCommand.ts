import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { EditSlackMessageResult } from './editSlackMessage.js';
import { editSlackMessage } from './editSlackMessage.js';
import { readStdinBody } from './readStdinBody.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

/**
 * Defines `<prefix> edit <permalink>`: rewrites one message the agent itself posted — a typo, a question it answered on its own, a body
 * that stopped being true. The new body is read from stdin as Markdown, exactly like `send`,
 * and replaces the old one whole: an edit never patches part of a message.
 *
 * Only the agent's own messages can be rewritten, and {@link editSlackMessage} decides that from
 * Slack's own metadata before any write goes out — the token is the developer's personal one, so
 * without that rule the agent could rewrite sentences he typed himself.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackEditCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackEditCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'edit']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Rewrite a message the agent posted, by its permalink',
            details:
                'The new body is read from stdin, as standard Markdown — not Slack mrkdwn — and replaces the whole ' +
                'message: there is no way to patch part of one, so pass the complete new text. Only messages the ' +
                'token owner posted through the API can be edited; anything else — a message typed in a Slack ' +
                "client, or somebody else's — is refused before any write goes out. The footer is rebuilt from " +
                'scratch by the same code the posting path uses, so the task link comes from the branch running the ' +
                'edit, not from the branch that posted the message. Slack marks an edited message "(edited)" by ' +
                'itself. Prints the permalink it was given back on stdout: an edit changes neither the channel nor ' +
                'the ts, so that permalink still names the message.',
            examples: [
                [
                    'Fix a message you just posted',
                    `printf "Corrected question?" | ${prefix} edit https://…/archives/C0.../p123...`,
                ],
                ['Rewrite a message from a file', `${prefix} edit https://…/archives/C0.../p123... < message.md`],
            ],
        });

        permalink = Option.String();

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const body = await readStdinBody(this.context.stdin);

            const client = await this.createClient();
            const identity = await client.auth.test();
            assert(identity.user_id, 'auth.test succeeded without a user_id in its response');

            const taskLink = await params.taskLink?.();
            const result = await editSlackMessage({
                client,
                permalink: this.permalink,
                body,
                ownerId: identity.user_id,
                taskLink,
            });

            return this.report(result);
        }

        private report(result: EditSlackMessageResult): SlackExitCode {
            switch (result.outcome) {
                case 'edited':
                    // The permalink the caller passed in, unchanged: `chat.update` keeps the channel and
                    // the ts, so it still names the message — and printing it keeps `edit` pipeable into
                    // the same places `send` is.
                    this.context.stdout.write(`${this.permalink}\n`);
                    return SLACK_EXIT_CODE.SUCCESS;

                case 'invalid_permalink':
                    this.context.stderr.write(`"${this.permalink}" is not a Slack message permalink.\n`);
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'message_not_found':
                    this.context.stderr.write(
                        `There is no message at "${this.permalink}" — it was most likely deleted.\n`,
                    );
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'not_agent_message':
                    this.context.stderr.write(
                        'That message was not posted by the agent, so it cannot be edited. Only messages the token ' +
                            'owner posted through the API can be rewritten — never one typed in a Slack client, and ' +
                            "never somebody else's.\n",
                    );
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'empty_body':
                    this.context.stderr.write('Refusing to send an empty message body.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                case 'broadcast_mention':
                    this.context.stderr.write('Refusing to send a message containing @channel, @here or @everyone.\n');
                    return SLACK_EXIT_CODE.INVALID_ARGUMENTS;

                default:
                    return assertNever(result, 'Unhandled edit Slack message outcome');
            }
        }
    };
}
