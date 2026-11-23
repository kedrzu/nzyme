import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';

import { LastfmError } from './LastfmError.js';
import { readLastfmBody } from './readLastfmBody.js';
import { readPath, textOf, toCount } from './utils/lastfmJson.js';

const METHOD = 'tag.getInfo';

/** Params of {@link LastfmTagGetInfo}. */
export interface LastfmTagGetInfoParams {
    tag: string;
}

/** A tag's profile. */
export interface LastfmTagGetInfoResult {
    name: string;
    /** How many times the tag was applied. */
    total: number;
    /** How many users applied the tag. */
    reach: number;
    /** The wiki summary as Last.fm sends it: HTML, ending in a "Read more" link. */
    summary: string | null;
}

/**
 * `tag.getInfo`: a tag's usage and wiki.
 * @returns `null` when Last.fm does not know the tag
 */
export const LastfmTagGetInfo = defineEndpoint<LastfmTagGetInfoParams, LastfmTagGetInfoResult | null>({
    request: params => ({ url: '', query: { method: METHOD, tag: params.tag } }),
    response: async response => {
        const body = await readLastfmBody(response, METHOD);
        if (body === null) {
            return null;
        }

        const tag = readPath(body, 'tag');
        const name = textOf(readPath(tag, 'name'));
        if (name === null) {
            // A body without the entity is malformed, not "not found" (error 6, above).
            throw new LastfmError({ method: METHOD, code: null, status: response.status });
        }

        return {
            name,
            total: toCount(readPath(tag, 'total')),
            reach: toCount(readPath(tag, 'reach')),
            summary: textOf(readPath(tag, 'wiki', 'summary')),
        };
    },
});
