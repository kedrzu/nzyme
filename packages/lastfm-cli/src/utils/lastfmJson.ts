/**
 * Helpers narrowing Last.fm's raw JSON, which is XML translated to JSON: a one-item list arrives as a
 * bare object, an empty one as `""` or not at all, numbers as strings, and text with attributes as
 * `{ "#text": … }`. Endpoints read bodies as `unknown` and narrow them through these.
 */
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/**
 * Reads a Last.fm list: an array as it is, a single item as a one-item array, and `""`, `null` or a
 * missing value as an empty array.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function toList(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }

    if (value == null || value === '') {
        return [];
    }

    return [value];
}

/**
 * Reads a Last.fm number, which usually arrives as a numeric string (`"12345"`).
 * @util
 * @returns the number, or `null` when the value is missing, empty or not numeric
 * @__NO_SIDE_EFFECTS__
 */
export function toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * Reads a count Last.fm always sends (listeners, playcount, a similarity match).
 * @util
 * @returns the number, or `0` when Last.fm sent none after all
 * @__NO_SIDE_EFFECTS__
 */
export function toCount(value: unknown): number {
    return toNumber(value) ?? 0;
}

/**
 * Reads a MusicBrainz id, which Last.fm sends as `""` when it has none.
 * @util
 * @returns the id, or `null` when it is empty or missing
 * @__NO_SIDE_EFFECTS__
 */
export function toMbid(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Reads Last.fm text that may carry attributes: `"Radiohead"` or `{ "#text": "Radiohead", "mbid": … }`.
 * @util
 * @returns the text, or `null` when there is none or it is empty
 * @__NO_SIDE_EFFECTS__
 */
export function textOf(value: unknown): string | null {
    const text = isPlainObject(value) ? value['#text'] : value;
    return typeof text === 'string' && text !== '' ? text : null;
}

/**
 * Reads a track duration in seconds, which Last.fm sends as `0` when it does not know it.
 * @util
 * @returns the duration, or `null` when it is unknown
 * @__NO_SIDE_EFFECTS__
 */
export function toDuration(value: unknown): number | null {
    const duration = toNumber(value);
    return duration ? duration : null;
}

/**
 * Walks into nested Last.fm objects: `readPath(body, 'similarartists', 'artist')`.
 * @util
 * @returns the value at the path, or `undefined` when a step is not an object
 * @__NO_SIDE_EFFECTS__
 */
export function readPath(value: unknown, ...keys: string[]): unknown {
    let current = value;
    for (const key of keys) {
        if (!isPlainObject(current)) {
            return undefined;
        }

        current = current[key];
    }

    return current;
}
