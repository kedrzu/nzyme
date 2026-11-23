import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { readTicketmasterList } from './readTicketmasterResponse.js';
import type { TicketmasterAttraction, TicketmasterList } from './TicketmasterTypes.js';

/** Parameters of {@link TicketmasterAttractionSearch}. */
export interface TicketmasterAttractionSearchParams {
    keyword: string;
    size: number;
    /** Page number from 0. */
    page: number;
    segmentName?: string;
    classificationName?: string;
}

/** Searches attractions (performers, teams). */
export const TicketmasterAttractionSearch = defineEndpoint<
    TicketmasterAttractionSearchParams,
    TicketmasterList<TicketmasterAttraction>
>({
    request: params => ({
        url: 'attractions.json',
        query: { ...params },
    }),
    response: response => readTicketmasterList<TicketmasterAttraction>(response, 'attractions'),
});
