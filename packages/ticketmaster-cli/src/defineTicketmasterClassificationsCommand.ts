import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import type { TicketmasterCommandParams } from './TicketmasterCommandsOptions.js';
import { TICKETMASTER_MUSIC_SEGMENT_ID, TicketmasterSegmentGet } from './TicketmasterSegmentGet.js';

/**
 * Defines `<prefix> classifications [--segment]`: the genres of a segment, `id  name` per line.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterClassificationsCommand(params: TicketmasterCommandParams): CommandClass {
    const { prefix } = params;

    return class TicketmasterClassificationsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'classifications']];
        static override usage = Command.Usage({
            category: 'Ticketmaster',
            description: 'List the genres of a segment, music by default',
            details: `
                Prints one tab-separated line per genre: id and name. \`--segment\` is \`music\` or a
                segment id. Filter events by a genre with \`${prefix} events --genre <name>\`.
            `,
            examples: [['Music genres', `${prefix} classifications`]],
        });

        segment = Option.String('--segment', 'music', { description: '`music` or a segment id' });

        override async run() {
            const id = this.segment.toLowerCase() === 'music' ? TICKETMASTER_MUSIC_SEGMENT_ID : this.segment;
            const client = createTicketmasterClient({
                apiKey: () => this.container.resolve(params.apiKey),
                locale: params.locale,
                baseUrl: params.baseUrl,
            });

            const segment = await client(TicketmasterSegmentGet, { id });
            if (!segment) {
                throw new UsageError(`Segment ${this.segment} not found.`);
            }

            for (const genre of segment._embedded?.genres ?? []) {
                this.context.stdout.write(formatTsvLine([genre.id, genre.name]));
            }
        }
    };
}
