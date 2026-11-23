import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import { TicketmasterAttractionSearch } from './TicketmasterAttractionSearch.js';
import type { TicketmasterCommandParams } from './TicketmasterCommandsOptions.js';
import type { TicketmasterAttraction } from './TicketmasterTypes.js';
import { formatPageFooter } from './utils/formatPageFooter.js';

/**
 * Defines `<prefix> attractions <query> [--size]`: one tab-separated line per attraction with its
 * external links, then a page footer.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterAttractionsCommand(params: TicketmasterCommandParams): CommandClass {
    const { prefix } = params;

    return class TicketmasterAttractionsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'attractions']];
        static override usage = Command.Usage({
            category: 'Ticketmaster',
            description: 'Search artists, teams and other attractions by name',
            details: `
                Prints one tab-separated line per attraction: id, name, genre, upcoming event count and
                its external links as \`kind=value\` (\`spotify=<url>\`, \`musicbrainz=<mbid>\`,
                \`homepage=<url>\`, …), then a \`# page N/M, T attractions\` footer. List an
                attraction's events with \`${prefix} events --artist-id <id>\`.
            `,
            examples: [['Find an artist', `${prefix} attractions "Arctic Monkeys"`]],
        });

        query = Option.String({ name: 'query' });
        size = Option.String('--size', '20', { description: 'Attractions per page, at most 200' });

        override async run() {
            const size = parseCount({ value: this.size, option: '--size', max: 200 });
            const client = createTicketmasterClient({
                apiKey: () => this.container.resolve(params.apiKey),
                locale: params.locale,
                baseUrl: params.baseUrl,
            });

            const result = await client(TicketmasterAttractionSearch, { keyword: this.query, size, page: 0 });
            for (const attraction of result.items) {
                this.context.stdout.write(
                    formatTsvLine([
                        attraction.id,
                        attraction.name,
                        attraction.classifications?.[0]?.genre?.name ?? '',
                        attraction.upcomingEvents?._total ?? '',
                        formatLinks(attraction),
                    ]),
                );
            }

            this.context.stdout.write(formatPageFooter(result.page, 'attraction'));
        }
    };
}

/** `kind=value` per external link kind, in the vendor's order: the MusicBrainz id, else the url. */
function formatLinks(attraction: TicketmasterAttraction) {
    const links: string[] = [];
    for (const [kind, entries] of Object.entries(attraction.externalLinks ?? {})) {
        const [first] = entries;
        const value = kind === 'musicbrainz' ? first?.id : first?.url;
        if (value) {
            links.push(`${kind}=${value}`);
        }
    }

    return links.join(' ');
}
