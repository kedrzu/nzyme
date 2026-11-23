import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { SlackCommand } from './SlackCommand.js';
import type { SlackCommandParams } from './SlackCommandsOptions.js';
import { SLACK_EXIT_CODE } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

/**
 * Defines `<prefix> whoami`: confirms which Slack identity and workspace the developer's token
 * authenticates as — the first thing to run after signing in, and a quick sanity check for every later
 * Slack command that assumes a live, valid user token.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackWhoamiCommand(params: SlackCommandParams): CommandClass {
    const { prefix } = params;

    return class SlackWhoamiCommand extends SlackCommand {
        static override paths = [[...prefix.split(' '), 'whoami']];
        static override usage = Command.Usage({
            category: 'Slack',
            description: 'Print the Slack identity and workspace your user token authenticates as',
            details:
                'Calls auth.test to confirm your user token is present and still valid, and reports who it signs ' +
                'in as and in which workspace.',
            examples: [['Show the current Slack identity', `${prefix} whoami`]],
        });

        protected readonly slackAuth = params.auth;

        protected async runSlack(): Promise<SlackExitCode> {
            const client = await this.createClient();
            const identity = await client.auth.test();

            assert(identity.user, 'auth.test succeeded without a user in its response');
            assert(identity.user_id, 'auth.test succeeded without a user_id in its response');
            assert(identity.team, 'auth.test succeeded without a team in its response');
            assert(identity.team_id, 'auth.test succeeded without a team_id in its response');

            this.context.stdout.write(`User: ${identity.user} (${identity.user_id})\n`);
            this.context.stdout.write(`Workspace: ${identity.team} (${identity.team_id})\n`);
            return SLACK_EXIT_CODE.SUCCESS;
        }
    };
}
