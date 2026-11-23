import { withQuery } from 'ufo';

import type { Endpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { defineFetchClient } from '@nzyme/fetch-utils/defineFetchClient.js';
import type { FetchClient } from '@nzyme/fetch-utils/defineFetchClient.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { waitFor } from '@nzyme/utils/waitFor.js';

import { LastfmError } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';

/** Options of {@link defineLastfmClient}. */
export interface LastfmClientOptions {
    /** The Last.fm API key, typically a `defineSecret('LASTFM_API_KEY')`. */
    apiKey: Injectable<string>;
    /** The API root; `https://ws.audioscrobbler.com/2.0/` when omitted. */
    baseUrl?: string;
    /** Sent with every request, as Last.fm asks clients to identify themselves. */
    userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const DEFAULT_USER_AGENT = '@nzyme/lastfm-cli (+https://github.com/kedrzu/nzyme)';
/** Last.fm allows about five requests a second per key; requests start at least this far apart. */
const MIN_INTERVAL_MS = 200;

/**
 * Defines the `LastfmClient` service: a fetch client running Last.fm endpoints. An endpoint's
 * `request` gives the query (with the Last.fm `method`) and a `url` resolved against `baseUrl` (`''`
 * for the API root); the client adds `api_key` and `format=json`, sends the `User-Agent`, starts
 * requests at least 200 ms apart and hands the response to the endpoint's `response`, which decodes it
 * with `readLastfmBody`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmClient(options: LastfmClientOptions) {
    return defineService({
        name: 'LastfmClient',
        deps: { apiKey: options.apiKey },
        setup({ apiKey }): FetchClient {
            const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
            const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
            // When the next request may start; shared by every caller of this client.
            let nextStart = 0;

            return defineFetchClient(run);

            async function run(endpoint: Endpoint<unknown, unknown>, params?: unknown) {
                const request = endpoint.request(params);
                const method = request.query?.method;
                if (typeof method !== 'string') {
                    throw new TypeError('A Last.fm endpoint must set the `method` query parameter');
                }

                const url = withQuery(new URL(request.url, baseUrl).href, {
                    ...request.query,
                    api_key: apiKey,
                    format: 'json',
                });

                await pace();

                let response: Response;
                try {
                    response = await fetch(url, { headers: { 'User-Agent': userAgent } });
                } catch {
                    // No cause: Bun's fetch errors carry the URL, and with it the API key.
                    throw new LastfmError({ method, code: null, status: 0 });
                }

                return endpoint.response ? endpoint.response(response, params) : readLastfmBody(response, method);
            }

            async function pace() {
                // The slot is taken synchronously, so concurrent calls queue up behind each other.
                const now = performance.now();
                const start = Math.max(now, nextStart);
                nextStart = start + MIN_INTERVAL_MS;
                if (start > now) {
                    await waitFor(start - now);
                }
            }
        },
    });
}
