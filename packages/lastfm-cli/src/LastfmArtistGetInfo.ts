import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { LastfmArtistLookup, LastfmArtistRef, LastfmTagRef } from './LastfmTypes.js';
import { LastfmError } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount } from './utils/lastfmJson.js';
import { artistLookupQuery } from './utils/lastfmLookupQuery.js';
import { parseLastfmItems, parseArtistRef, parseNamedItem, parseTagRefs } from './utils/parseLastfmItems.js';

const METHOD = 'artist.getInfo';

/** Params of {@link LastfmArtistGetInfo}. */
export type LastfmArtistGetInfoParams = LastfmArtistLookup & {
    /** The language of the biography, as an ISO 639 alpha-2 code; English when omitted. */
    lang?: string;
};

/** An artist's profile. */
export interface LastfmArtistGetInfoResult {
    /** The name Last.fm resolved the lookup to. */
    name: string;
    mbid: string | null;
    url: string | null;
    listeners: number;
    playcount: number;
    /** A few similar artists; Last.fm sends no MBIDs here. */
    similar: LastfmArtistRef[];
    /** The top tags. */
    tags: LastfmTagRef[];
    /** The biography summary as Last.fm sends it: HTML, ending in a "Read more" link. */
    summary: string | null;
}

/**
 * `artist.getInfo`: an artist's profile, stats, tags, similar artists and biography.
 * @returns `null` when Last.fm does not know the artist
 */
export const LastfmArtistGetInfo = defineEndpoint<LastfmArtistGetInfoParams, LastfmArtistGetInfoResult | null>({
    request: params => ({ url: '', query: { method: METHOD, ...artistLookupQuery(params), lang: params.lang } }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const artist = readPath(body, 'artist');
        const named = isPlainObject(artist) ? parseNamedItem(artist) : null;
        if (named === null) {
            // A body without the entity is malformed, not "not found" (error 6, above).
            throw new LastfmError({ method: METHOD, code: null, status: response.status });
        }

        return {
            ...named,
            listeners: toCount(readPath(artist, 'stats', 'listeners')),
            playcount: toCount(readPath(artist, 'stats', 'playcount')),
            similar: parseLastfmItems(readPath(artist, 'similar', 'artist'), parseArtistRef),
            tags: parseTagRefs(readPath(artist, 'tags')),
            summary: textOf(readPath(artist, 'bio', 'summary')),
        };
    },
});
