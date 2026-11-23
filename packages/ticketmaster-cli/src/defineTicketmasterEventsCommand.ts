import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

import { createTicketmasterClient } from './createTicketmasterClient.js';
import type { TicketmasterCommandParams } from './TicketmasterCommandsOptions.js';
import { TicketmasterEventSearch } from './TicketmasterEventSearch.js';
import type { TicketmasterEventSearchParams } from './TicketmasterEventSearch.js';
import type { TicketmasterEvent } from './TicketmasterTypes.js';
import { encodeGeohash } from './utils/encodeGeohash.js';
import { formatPageFooter } from './utils/formatPageFooter.js';
import { formatPriceRange } from './utils/formatPriceRange.js';

/** The most events one page may hold. */
const MAX_SIZE = 200;
/** The vendor's deep-paging window: `size * page` must stay below it. */
const PAGING_WINDOW = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Defines `<prefix> events [filters] [--size] [--page]`: one tab-separated line per event, sorted by
 * date, then a `# page N/M, T events` footer.
 * @__NO_SIDE_EFFECTS__
 */
export function defineTicketmasterEventsCommand(params: TicketmasterCommandParams): CommandClass {
    const { prefix } = params;

    return class TicketmasterEventsCommand extends Command {
        static override paths = [[...prefix.split(' '), 'events']];
        static override usage = Command.Usage({
            category: 'Ticketmaster',
            description: 'Search upcoming events, music by default',
            details: `
                Prints one tab-separated line per event, sorted by date: id, local date, local time,
                name, venue, city, country code, price range, status and url, then a footer
                \`# page N/M, T events\` (\`# 0 events\` when nothing matched). With no filter it lists
                upcoming music events worldwide; \`--segment all\` drops the music restriction.
                Resolve an artist id with \`${prefix} attractions <name>\`, a venue id with
                \`${prefix} venues <name>\`, genre names with \`${prefix} classifications\`; show one
                event with \`${prefix} event <id>\`.

                \`--from\`/\`--to\` are dates in the event's local time. The search is widened by a day
                on each side and the edge events are dropped afterwards, so a page may show fewer than
                \`--size\` events and the footer total counts the dropped ones. Paging stops at
                size * page < ${PAGING_WINDOW}.
            `,
            examples: [
                ['Concerts in Warsaw in December', `${prefix} events --city Warsaw --from 2026-12-01 --to 2026-12-31`],
                ['Upcoming shows of one artist', `${prefix} events --artist-id K8vZ9171ob7`],
                ['Rock within 50 km of a point', `${prefix} events --near 52.23,21.01 --radius-km 50 --genre Rock`],
            ],
        });

        keyword = Option.String('--keyword', { description: 'Free-text search' });
        artistId = Option.String('--artist-id', { description: 'Attraction id(s), comma-separated' });
        venueId = Option.String('--venue-id', { description: 'Venue id(s), comma-separated' });
        country = Option.String('--country', { description: 'ISO country code, e.g. PL' });
        city = Option.String('--city', { description: 'City name(s), comma-separated' });
        near = Option.String('--near', { description: 'The search centre as `lat,long`' });
        radiusKm = Option.String('--radius-km', { description: 'The radius around --near or --city, in km' });
        from = Option.String('--from', { description: 'The first local date, YYYY-MM-DD' });
        to = Option.String('--to', { description: 'The last local date, YYYY-MM-DD' });
        genre = Option.String('--genre', { description: 'A genre name within the segment, e.g. Rock' });
        segment = Option.String('--segment', 'Music', { description: 'A segment name, or `all`' });
        size = Option.String('--size', '20', { description: `Events per page, at most ${MAX_SIZE}` });
        page = Option.String('--page', '0', { description: 'The page number, from 0' });

        override async run() {
            const query = this.buildQuery();
            const client = createTicketmasterClient({
                apiKey: () => this.container.resolve(params.apiKey),
                locale: params.locale,
                baseUrl: params.baseUrl,
            });

            const result = await client(TicketmasterEventSearch, query);
            for (const event of result.items) {
                if (isWithinDates({ event, from: this.from, to: this.to })) {
                    this.context.stdout.write(formatEventLine(event));
                }
            }

            this.context.stdout.write(formatPageFooter(result.page, 'event'));
        }

        private buildQuery(): TicketmasterEventSearchParams {
            const size = parseCount({ value: this.size, option: '--size', max: MAX_SIZE });
            const page = parsePage(this.page);
            if (size * page >= PAGING_WINDOW) {
                throw new UsageError(
                    `--size ${size} with --page ${page} is beyond Ticketmaster's paging window: size * page must be below ${PAGING_WINDOW}.`,
                );
            }

            if (this.radiusKm !== undefined && this.near === undefined && this.city === undefined) {
                throw new UsageError('--radius-km needs --near or --city.');
            }

            const from = this.from === undefined ? undefined : parseDate(this.from, '--from');
            const to = this.to === undefined ? undefined : parseDate(this.to, '--to');
            if (from && to && from > to) {
                throw new UsageError(`--from ${this.from} is after --to ${this.to}.`);
            }

            return {
                keyword: this.keyword,
                attractionId: this.artistId,
                venueId: this.venueId,
                countryCode: this.country,
                city: this.city,
                geoPoint: this.near === undefined ? undefined : encodeGeohash(parseNear(this.near)),
                radius: this.radiusKm === undefined ? undefined : parseRadius(this.radiusKm),
                unit: this.radiusKm === undefined ? undefined : 'km',
                startDateTime: from && `${formatDate(from.getTime() - DAY_MS)}T00:00:00Z`,
                endDateTime: to && `${formatDate(to.getTime() + DAY_MS)}T23:59:59Z`,
                classificationName: this.genre,
                segmentName: this.segment.toLowerCase() === 'all' ? undefined : this.segment,
                size,
                page,
                sort: 'date,asc',
            };
        }
    };
}

/** Params of {@link isWithinDates}. */
interface IsWithinDatesParams {
    event: TicketmasterEvent;
    from: string | undefined;
    to: string | undefined;
}

/** Whether the event's local date is within `from..to`; an event without one is kept. */
function isWithinDates({ event, from, to }: IsWithinDatesParams) {
    const date = event.dates?.start?.localDate;
    if (!date) {
        return true;
    }

    return (from === undefined || date >= from) && (to === undefined || date <= to);
}

function formatEventLine(event: TicketmasterEvent) {
    const venue = event._embedded?.venues?.[0];
    return formatTsvLine([
        event.id,
        event.dates?.start?.localDate ?? '',
        event.dates?.start?.localTime?.slice(0, 5) ?? '',
        event.name,
        venue?.name ?? '',
        venue?.city?.name ?? '',
        venue?.country?.countryCode ?? '',
        formatPriceRange(event.priceRanges),
        event.dates?.status?.code ?? '',
        event.url ?? '',
    ]);
}

function parsePage(value: string) {
    if (!/^\d+$/.test(value)) {
        throw new UsageError(`--page must be a non-negative integer, got ${value}.`);
    }

    return Number(value);
}

/** A `YYYY-MM-DD` calendar date as UTC midnight; a `UsageError` for anything else, e.g. `2026-02-30`. */
function parseDate(value: string, option: string) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || formatDate(date.getTime()) !== value) {
        throw new UsageError(`${option} must be a date as YYYY-MM-DD, got ${value}.`);
    }

    return date;
}

function formatDate(time: number) {
    return new Date(time).toISOString().slice(0, 10);
}

function parseNear(value: string) {
    const parts = value.split(',').map(part => part.trim());
    const [latitude, longitude] = parts.map(Number);
    if (
        parts.length !== 2 ||
        parts.includes('') ||
        latitude === undefined ||
        longitude === undefined ||
        !(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)
    ) {
        throw new UsageError(`--near must be \`lat,long\` in degrees, got ${value}.`);
    }

    return { latitude, longitude };
}

function parseRadius(value: string) {
    const radius = Number(value);
    if (!(Number.isFinite(radius) && radius > 0)) {
        throw new UsageError(`--radius-km must be a positive number, got ${value}.`);
    }

    return radius;
}
