import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { readTicketmasterList } from './readTicketmasterResponse.js';
import type { TicketmasterList, TicketmasterVenue } from './TicketmasterTypes.js';

/** Parameters of {@link TicketmasterVenueSearch}. */
export interface TicketmasterVenueSearchParams {
    keyword: string;
    /** ISO 3166-1 alpha-2 country code. */
    countryCode?: string;
    size: number;
    /** Page number from 0. */
    page: number;
}

/** Searches venues. */
export const TicketmasterVenueSearch = defineEndpoint<
    TicketmasterVenueSearchParams,
    TicketmasterList<TicketmasterVenue>
>({
    request: params => ({
        url: 'venues.json',
        query: { ...params },
    }),
    response: response => readTicketmasterList<TicketmasterVenue>(response, 'venues'),
});
