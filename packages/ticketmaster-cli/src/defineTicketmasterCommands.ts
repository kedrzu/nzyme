import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { defineTicketmasterAttractionsCommand } from './defineTicketmasterAttractionsCommand.js';
import { defineTicketmasterClassificationsCommand } from './defineTicketmasterClassificationsCommand.js';
import { defineTicketmasterEventCommand } from './defineTicketmasterEventCommand.js';
import { defineTicketmasterEventsCommand } from './defineTicketmasterEventsCommand.js';
import { defineTicketmasterVenuesCommand } from './defineTicketmasterVenuesCommand.js';
import type { TicketmasterCommandParams, TicketmasterCommandsOptions } from './TicketmasterCommandsOptions.js';

/**
 * Defines the Ticketmaster Discovery commands: `events`, `event`, `attractions`, `venues` and
 * `classifications`. Each sends one request. Export them from a plugin module or spread them into a
 * product CLI's `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterCommands(options: TicketmasterCommandsOptions): CommandClass[] {
    const params: TicketmasterCommandParams = {
        prefix: options.prefix ?? 'ticketmaster',
        apiKey: options.apiKey,
        locale: options.locale ?? '*',
        baseUrl: options.baseUrl,
    };

    return [
        defineTicketmasterEventsCommand(params),
        defineTicketmasterEventCommand(params),
        defineTicketmasterAttractionsCommand(params),
        defineTicketmasterVenuesCommand(params),
        defineTicketmasterClassificationsCommand(params),
    ];
}
