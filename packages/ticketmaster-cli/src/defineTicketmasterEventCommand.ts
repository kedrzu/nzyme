import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import type { TicketmasterCommandParams } from './TicketmasterCommandsOptions.js';
import { TicketmasterEventGet } from './TicketmasterEventGet.js';
import type { TicketmasterEvent, TicketmasterSaleWindow } from './TicketmasterTypes.js';
import { formatPriceRange } from './utils/formatPriceRange.js';

/**
 * Defines `<prefix> event <id>`: the event's details as a `key: value` header block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterEventCommand(params: TicketmasterCommandParams): CommandClass {
    const { prefix } = params;

    return class TicketmasterEventCommand extends Command {
        static override paths = [[...prefix.split(' '), 'event']];
        static override usage = Command.Usage({
            category: 'Ticketmaster',
            description: 'Show one event in detail',
            details: `
                Prints \`key: value\` lines: name, id, local date and time, time zone, status, venue and
                address, attractions with their ids, genre, price ranges, public sale and presale
                windows, url, info and notes. Find event ids with \`${prefix} events\`.
            `,
            examples: [['One event', `${prefix} event vvG1zZ9kzFBeXA`]],
        });

        id = Option.String({ name: 'id' });

        override async run() {
            const client = createTicketmasterClient({
                apiKey: () => this.container.resolve(params.apiKey),
                locale: params.locale,
                baseUrl: params.baseUrl,
            });

            const event = await client(TicketmasterEventGet, { id: this.id });
            if (!event) {
                throw new UsageError(`Event ${this.id} not found.`);
            }

            this.context.stdout.write(formatEvent(event));
        }
    };
}

function formatEvent(event: TicketmasterEvent) {
    const venue = event._embedded?.venues?.[0];
    const classification = event.classifications?.[0];
    const genres = [classification?.segment, classification?.genre, classification?.subGenre]
        .map(level => level?.name)
        .filter(name => name !== undefined && name !== '');

    return formatHeaderBlock([
        ['name', event.name],
        ['id', event.id],
        ['date', event.dates?.start?.localDate ?? ''],
        ['time', event.dates?.start?.localTime?.slice(0, 5) ?? ''],
        ['timezone', event.dates?.timezone ?? venue?.timezone ?? ''],
        ['status', event.dates?.status?.code ?? ''],
        ['venue', venue?.name ?? ''],
        [
            'address',
            [
                venue?.address?.line1,
                [venue?.postalCode, venue?.city?.name].filter(Boolean).join(' '),
                venue?.country?.name ?? venue?.country?.countryCode,
            ]
                .filter(Boolean)
                .join(', '),
        ],
        [
            'attractions',
            (event._embedded?.attractions ?? []).map(attraction => `${attraction.name} (${attraction.id})`).join(', '),
        ],
        ['genre', [...new Set(genres)].join(' / ')],
        [
            'prices',
            (event.priceRanges ?? [])
                .map(range => [range.type, formatPriceRange([range])].filter(Boolean).join(' '))
                .join('; '),
        ],
        ['public sale', formatWindow(event.sales?.public)],
        [
            'presales',
            (event.sales?.presales ?? [])
                .map(presale => [presale.name, formatWindow(presale)].filter(Boolean).join(': '))
                .join('; '),
        ],
        ['url', event.url ?? ''],
        ['info', event.info ?? ''],
        ['please note', event.pleaseNote ?? ''],
    ]);
}

/** A sale window, `start – end`; empty when it has neither. */
function formatWindow(window: TicketmasterSaleWindow | undefined) {
    if (!window?.startDateTime && !window?.endDateTime) {
        return '';
    }

    return `${window.startDateTime ?? ''} – ${window.endDateTime ?? ''}`;
}
