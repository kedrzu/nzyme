import { defineFetchClient } from '@nzyme/fetch-utils/defineFetchClient.js';
import type { FetchClient } from '@nzyme/fetch-utils/defineFetchClient.js';

import { TicketmasterError } from './TicketmasterError.js';

const DEFAULT_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/';

/** Options of {@link createTicketmasterClient}. */
export interface TicketmasterClientOptions {
    /** The API key, or a function returning it; read on every request. */
    apiKey: string | (() => string | Promise<string>);
    /** Defaults to `https://app.ticketmaster.com/discovery/v2/`. */
    baseUrl?: string;
    /** Defaults to `*` (all locales). */
    locale?: string;
}

/**
 * Creates a client executing the Ticketmaster endpoints. Adds `apikey` and `locale` to every request.
 * Failures are {@link TicketmasterError}s that never contain the API key; it does not use fetch-utils'
 * `FetchError`, which stores the response url.
 * @__NO_SIDE_EFFECTS__
 */
export function createTicketmasterClient(options: TicketmasterClientOptions): FetchClient {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const locale = options.locale ?? '*';

    return defineFetchClient(async (endpoint, params) => {
        const request = endpoint.request(params);
        const { url: relativeUrl, query, ...init } = request;
        const url = new URL(relativeUrl, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

        for (const [key, value] of Object.entries(query ?? {})) {
            if (value === undefined || value === null) {
                continue;
            }
            for (const item of Array.isArray(value) ? value : [value]) {
                url.searchParams.append(key, String(item));
            }
        }

        const apiKey = typeof options.apiKey === 'function' ? await options.apiKey() : options.apiKey;
        url.searchParams.set('apikey', apiKey);
        url.searchParams.set('locale', locale);

        let response: Response;
        try {
            response = await fetch(url, init);
        } catch (error) {
            throw new TicketmasterError(`Could not reach Ticketmaster (${describeFailure(error)})`, {
                operation: url.pathname,
                status: 0,
            });
        }

        return endpoint.response ? endpoint.response(response, params) : response;
    });
}

/** Names only the code or name of a failure, never its message, which may contain the url. */
function describeFailure(error: unknown): string {
    if (!(error instanceof Error)) {
        return 'unknown error';
    }

    return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}
