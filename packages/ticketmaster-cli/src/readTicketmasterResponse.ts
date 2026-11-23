import { TicketmasterError } from './TicketmasterError.js';
import type { TicketmasterList, TicketmasterPage } from './TicketmasterTypes.js';

/**
 * Converts a non-2xx response into a {@link TicketmasterError}. The one place a status becomes an error.
 * Never reads the body and never includes the url, which carries the API key.
 */
function toError(response: Response): TicketmasterError {
    const operation = new URL(response.url).pathname;
    const { status } = response;
    const data = { operation, status };

    if (status === 401 || status === 403) {
        return new TicketmasterError(`Ticketmaster rejected the API key (${status})`, data);
    }

    if (status === 429) {
        const reset = Number(response.headers.get('Rate-Limit-Reset'));
        const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset) : null;
        const when =
            resetAt && !Number.isNaN(resetAt.getTime()) ? `; the limit resets at ${resetAt.toISOString()}` : '';
        return new TicketmasterError(`Ticketmaster rate limit exceeded (5 requests/s and 5000 calls/day)${when}`, data);
    }

    return new TicketmasterError(`Ticketmaster ${operation} failed with status ${status}`, data);
}

/**
 * Reads a Ticketmaster JSON response, throwing a {@link TicketmasterError} for any non-2xx status
 * except the statuses listed in `nullOn`, which return `null`.
 * @param response - The response from the client
 * @param nullOn - Statuses that are an expected outcome and return `null`
 */
export async function readTicketmasterResponse<T>(response: Response, nullOn: number[] = []): Promise<T | null> {
    if (nullOn.includes(response.status)) {
        return null;
    }

    if (!response.ok) {
        throw toError(response);
    }

    // The JSON body is unknown; the vendor type is a partial description of the documented shape.
    return (await response.json()) as T;
}

/** The HAL envelope of a list response. */
interface HalList {
    _embedded?: Record<string, unknown[] | undefined>;
    page?: TicketmasterPage;
}

/**
 * Reads a Ticketmaster list response and unwraps the HAL envelope: `items` come from
 * `_embedded.<key>` (missing means an empty list) and `page` is the paging block.
 * @param response - The response from the client
 * @param key - The `_embedded` key holding the items
 */
export async function readTicketmasterList<T>(response: Response, key: string): Promise<TicketmasterList<T>> {
    const body = await readTicketmasterResponse<HalList>(response);

    // The items array is typed by the caller's key; the body is the vendor's documented shape.
    const items = (body?._embedded?.[key] ?? []) as T[];
    return { items, page: body?.page ?? { size: 0, totalElements: 0, totalPages: 0, number: 0 } };
}
