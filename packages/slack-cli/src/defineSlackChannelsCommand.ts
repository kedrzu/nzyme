import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { fetchSlackDirectory, filterSlackChannels } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackDirectory } from './formatSlackDirectory.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

const DEFAULT_LIMIT = 20;

/**
 * Defines `<prefix> channels [query]`: searches the Slack directory for channels — the other half of target resolution: without a
 * description an agent cannot tell `#eng-core` from `#eng-platform`, so every result carries
 * visibility, member count and purpose/topic, not just a name.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackChannelsCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackChannelsCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'channels']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Search Slack channels, or list the first few with no query',
            details:
                'Matches a query against channel name, purpose and topic, across public and private channels the ' +
                'token can see. Without a query, lists the first --limit channels instead.',
            examples: [
                ['List the first few channels', `${prefix} channels`],
                ['Search for a dev channel', `${prefix} channels dev`],
            ],
        });

        query = Option.String({ required: false });
        limit = Option.String('--limit,-l', String(DEFAULT_LIMIT), {
            description: `Max entries to print (default ${DEFAULT_LIMIT})`,
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const limit = this.parseLimit(this.limit);
            if (limit == null) {
                return SLACK_EXIT_CODE.INVALID_ARGUMENTS;
            }

            const client = await this.createClient();
            const { channels } = await fetchSlackDirectory(client);
            const matches = filterSlackChannels(channels, this.query ?? '');
            const shown = matches.slice(0, limit);

            if (shown.length === 0) {
                this.context.stdout.write('No matching channels found.\n');
                return SLACK_EXIT_CODE.SUCCESS;
            }

            for (const line of formatSlackDirectory(shown)) {
                this.context.stdout.write(`${line}\n`);
            }
            if (matches.length > shown.length) {
                this.context.stdout.write(`… and ${matches.length - shown.length} more (raise --limit to see them).\n`);
            }
            return SLACK_EXIT_CODE.SUCCESS;
        }
    };
}
