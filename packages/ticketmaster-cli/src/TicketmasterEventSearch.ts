import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { readTicketmasterList } from './readTicketmasterResponse.js';
import type { TicketmasterEvent, TicketmasterList } from './TicketmasterTypes.js';

/** Parameters of {@link TicketmasterEventSearch}; all optional, undefined ones are omitted. */
export interface TicketmasterEventSearchParams {
    keyword?: string;
    attractionId?: string;
    venueId?: string;
    /** ISO 3166-1 alpha-2 country code. */
    countryCode?: string;
    city?: string;
    /** A geohash of the search centre; use with `radius` and `unit`. */
    geoPoint?: string;
    radius?: number;
    unit?: 'km' | 'miles';
    /** UTC `YYYY-MM-DDTHH:mm:ssZ`. */
    startDateTime?: string;
    /** UTC `YYYY-MM-DDTHH:mm:ssZ`. */
    endDateTime?: string;
    classificationName?: string;
    segmentName?: string;
    size?: number;
    /** Page number from 0. */
    page?: number;
    sort?: string;
}

/** Searches events. */
export const TicketmasterEventSearch = defineEndpoint<
    TicketmasterEventSearchParams,
    TicketmasterList<TicketmasterEvent>
>({
    request: params => ({
        url: 'events.json',
        query: { ...params },
    }),
    response: response => readTicketmasterList<TicketmasterEvent>(response, 'events'),
});
