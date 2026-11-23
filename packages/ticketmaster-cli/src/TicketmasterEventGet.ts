import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { readTicketmasterResponse } from './readTicketmasterResponse.js';
import type { TicketmasterEvent } from './TicketmasterTypes.js';

/** Parameters of {@link TicketmasterEventGet}. */
export interface TicketmasterEventGetParams {
    id: string;
}

/** Gets an event by id; `null` when it does not exist (404) or the id is malformed (400). */
export const TicketmasterEventGet = defineEndpoint<TicketmasterEventGetParams, TicketmasterEvent | null>({
    request: params => ({ url: `events/${encodeURIComponent(params.id)}.json` }),
    response: response => readTicketmasterResponse<TicketmasterEvent>(response, [400, 404]),
});
