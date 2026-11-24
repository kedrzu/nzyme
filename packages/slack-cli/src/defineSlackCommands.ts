import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { defineSlackAuthCommand } from './defineSlackAuthCommand.js';
import { defineSlackChannelsCommand } from './defineSlackChannelsCommand.js';
import { defineSlackEditCommand } from './defineSlackEditCommand.js';
import { defineSlackPeopleCommand } from './defineSlackPeopleCommand.js';
import { defineSlackReadCommand } from './defineSlackReadCommand.js';
import { defineSlackSearchCommand } from './defineSlackSearchCommand.js';
import { defineSlackSendCommand } from './defineSlackSendCommand.js';
import { defineSlackWaitCommand } from './defineSlackWaitCommand.js';
import { defineSlackWhoamiCommand } from './defineSlackWhoamiCommand.js';
import type { SlackCommandParams, SlackCommandsOptions } from './SlackCommandsOptions.js';

/**
 * Defines the Slack commands, acting as the developer through their own user token: sign-in, whoami,
 * reading and searching conversations, the channel and people directories, and sending, editing and
 * waiting for replies as a marked agent. Export them from a plugin module or spread them into a
 * product CLI's `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackCommands(options: SlackCommandsOptions): CommandClass[] {
    const params: SlackCommandParams = {
        prefix: options.prefix ?? 'slack',
        auth: options.auth,
        taskLink: options.taskLink,
    };

    return [
        defineSlackAuthCommand(params),
        defineSlackWhoamiCommand(params),
        defineSlackReadCommand(params),
        defineSlackSearchCommand(params),
        defineSlackChannelsCommand(params),
        defineSlackPeopleCommand(params),
        defineSlackSendCommand(params),
        defineSlackEditCommand(params),
        defineSlackWaitCommand(params),
    ];
}
