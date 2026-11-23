/**
 * Parsers of the items Last.fm's methods share: lists, artist and tag references, ranks. An item
 * without a name is skipped, never emitted with an empty one: Last.fm occasionally sends a blank
 * entry, and a row with no name helps no reader.
 */
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { LastfmArtistRef, LastfmItemRef, LastfmTagRef } from '../LastfmTypes.js';

import { readPath, textOf, toList, toMbid, toNumber } from './lastfmJson.js';

/** An item's own name, ids and page, before any method-specific fields. */
export interface LastfmNamedItem {
    name: string;
    mbid: string | null;
    url: string | null;
}

/**
 * Reads a Last.fm list (an array, a single object, `""` or missing) item by item, skipping entries
 * that are not objects and those `parse` rejects with `null`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseLastfmItems<T>(value: unknown, parse: (item: Record<string, unknown>) => T | null): T[] {
    const items: T[] = [];
    for (const item of toList(value)) {
        const parsed = isPlainObject(item) ? parse(item) : null;
        if (parsed !== null) {
            items.push(parsed);
        }
    }

    return items;
}

/**
 * Reads an item's `name`, `mbid` and `url`.
 * @util
 * @returns the item, or `null` when it has no name
 * @__NO_SIDE_EFFECTS__
 */
export function parseNamedItem(item: Record<string, unknown>): LastfmNamedItem | null {
    const name = textOf(item.name);
    return name === null ? null : { name, mbid: toMbid(item.mbid), url: textOf(item.url) };
}

/**
 * Reads a track or an album with its artist; `artist` may be an object or only a name.
 * @util
 * @returns the item, or `null` when it or its artist has no name
 * @__NO_SIDE_EFFECTS__
 */
export function parseItemRef(item: Record<string, unknown>): LastfmItemRef | null {
    const named = parseNamedItem(item);
    const artist = parseArtistRef(item.artist);
    return named && artist ? { ...named, artist } : null;
}

/**
 * Reads an artist reference in any of Last.fm's forms: `"Cher"`, `{ name, mbid, url }` or
 * `{ "#text": "Cher", mbid }`.
 * @util
 * @returns the artist, or `null` when there is no name
 * @__NO_SIDE_EFFECTS__
 */
export function parseArtistRef(value: unknown): LastfmArtistRef | null {
    if (!isPlainObject(value)) {
        const name = textOf(value);
        return name === null ? null : { name, mbid: null, url: null };
    }

    const name = textOf(value.name) ?? textOf(value);
    return name === null ? null : { name, mbid: toMbid(value.mbid), url: textOf(value.url) };
}

/**
 * Reads a `{ tag: [...] }` container (or `""`) into tag references.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseTagRefs(value: unknown): LastfmTagRef[] {
    return parseLastfmItems(readPath(value, 'tag'), parseTagRef);
}

/**
 * Reads one tag.
 * @util
 * @returns the tag, or `null` when it has no name
 * @__NO_SIDE_EFFECTS__
 */
export function parseTagRef(item: Record<string, unknown>): LastfmTagRef | null {
    const name = textOf(item.name);
    return name === null ? null : { name, url: textOf(item.url) };
}

/**
 * Reads an item's 1-based position from its `@attr.rank`.
 * @util
 * @returns the rank, `0` when Last.fm sent none
 * @__NO_SIDE_EFFECTS__
 */
export function rankOf(item: Record<string, unknown>): number {
    return toNumber(readPath(item, '@attr', 'rank')) ?? 0;
}
