import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { readTicketmasterResponse } from './readTicketmasterResponse.js';
import type { TicketmasterClassification } from './TicketmasterTypes.js';

/** The Music segment id. */
export const TICKETMASTER_MUSIC_SEGMENT_ID = 'KZFzniwnSyZfZ7v7nJ';

/** Parameters of {@link TicketmasterSegmentGet}. */
export interface TicketmasterSegmentGetParams {
    id: string;
}

/** Gets a segment classification with its genres in `_embedded.genres`; `null` when unknown. */
export const TicketmasterSegmentGet = defineEndpoint<TicketmasterSegmentGetParams, TicketmasterClassification | null>({
    request: params => ({ url: `classifications/segments/${encodeURIComponent(params.id)}.json` }),
    response: response => readTicketmasterResponse<TicketmasterClassification>(response, [404]),
});
