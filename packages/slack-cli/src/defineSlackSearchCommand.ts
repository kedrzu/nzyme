import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { fetchSlackDirectory } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackMessages } from './formatSlackMessages.js';
import { searchSlackMessages } from './searchSlackMessages.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

const DEFAULT_LIMIT = 20;

/**
 * Defines `<prefix> search <query>`: searches Slack messages across every channel and DM the token can see — the "was this discussed
 * before" question an agent needs answered without a human retyping the thread. Covers private
 * channels and DMs, not just what a bot could reach, because it runs on the developer's own token.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackSearchCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackSearchCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'search']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Search Slack messages across channels and DMs the token can see',
            details:
                'Runs search.messages for the developer’s own account. A result capped by --limit always says ' +
                'how many more matches exist, so a truncated search never reads as a complete one.',
            examples: [
                ['Search for a topic', `${prefix} search audit`],
                ['Limit the number of results', `${prefix} search retention --limit 5`],
            ],
        });

        query = Option.String();
        limit = Option.String('--limit,-l', String(DEFAULT_LIMIT), {
            description: `Max matches to print (default ${DEFAULT_LIMIT})`,
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const limit = this.parseLimit(this.limit);
            if (limit == null) {
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const client = await this.createClient();
            const [{ matches, omission }, { people }] = await Promise.all([
                searchSlackMessages({ client, query: this.query, limit }),
                fetchSlackDirectory(client),
            ]);

            if (matches.length === 0) {
                this.context.stdout.write('No matching messages found.\n');
                return SLACK_EXIT_CODE.SUCCESS;
            }

            for (const block of formatSlackMessages(matches, { people, omission })) {
                this.context.stdout.write(`${block}\n\n`);
            }
            return SLACK_EXIT_CODE.SUCCESS;
        }
    };
}
