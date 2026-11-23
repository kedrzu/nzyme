import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { fetchSlackDirectory, filterSlackPeople } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackDirectory } from './formatSlackDirectory.js';
import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

const DEFAULT_LIMIT = 20;

/**
 * Defines `<prefix> people [query]`: searches the Slack directory for people — the half of target resolution `resolveSlackTarget`
 * cannot do silently: when a search matches more than one person, the agent needs to see all of
 * them (with enough detail to tell them apart) and re-run with an id, rather than have one picked
 * for it.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackPeopleCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackPeopleCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'people']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Search the Slack directory for people, or list the first few with no query',
            details:
                'Matches a query against first name, real name, display name, handle, email and profile title. ' +
                'Without a query, lists the first --limit people instead.',
            examples: [
                ['List the first few people', `${prefix} people`],
                ['Search for Frank', `${prefix} people frank`],
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
            const { people } = await fetchSlackDirectory(client);
            const matches = filterSlackPeople(people, this.query ?? '');
            const shown = matches.slice(0, limit);

            if (shown.length === 0) {
                this.context.stdout.write('No matching people found.\n');
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
