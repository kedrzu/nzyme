import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import type { TicketmasterCommandParams } from './TicketmasterCommandsOptions.js';
import { TicketmasterVenueSearch } from './TicketmasterVenueSearch.js';
import { formatPageFooter } from './utils/formatPageFooter.js';

/**
 * Defines `<prefix> venues <query> [--country] [--size]`: one tab-separated line per venue, then a page
 * footer.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterVenuesCommand(params: TicketmasterCommandParams): CommandClass {
    const { prefix } = params;

    return class TicketmasterVenuesCommand extends Command {
        static override paths = [[...prefix.split(' '), 'venues']];
        static override usage = Command.Usage({
            category: 'Ticketmaster',
            description: 'Search venues by name',
            details: `
                Prints one tab-separated line per venue: id, name, city, country code, address and
                upcoming event count, then a \`# page N/M, T venues\` footer. List a venue's events with
                \`${prefix} events --venue-id <id>\`.
            `,
            examples: [['Venues in Poland', `${prefix} venues Torwar --country PL`]],
        });

        query = Option.String({ name: 'query' });
        country = Option.String('--country', { description: 'ISO country code, e.g. PL' });
        size = Option.String('--size', '20', { description: 'Venues per page, at most 200' });

        override async run() {
            const size = parseCount({ value: this.size, option: '--size', max: 200 });
            const client = createTicketmasterClient({
                apiKey: () => this.container.resolve(params.apiKey),
                locale: params.locale,
                baseUrl: params.baseUrl,
            });

            const result = await client(TicketmasterVenueSearch, {
                keyword: this.query,
                countryCode: this.country,
                size,
                page: 0,
            });
            for (const venue of result.items) {
                this.context.stdout.write(
                    formatTsvLine([
                        venue.id,
                        venue.name,
                        venue.city?.name ?? '',
                        venue.country?.countryCode ?? '',
                        venue.address?.line1 ?? '',
                        venue.upcomingEvents?._total ?? '',
                    ]),
                );
            }

            this.context.stdout.write(formatPageFooter(result.page, 'venue'));
        }
    };
}
