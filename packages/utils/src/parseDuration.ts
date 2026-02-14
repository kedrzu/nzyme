import type { Duration } from 'date-fns';

import type { StringNonLiteral } from '@nzyme/types/Common.js';
import type { DurationISO } from '@nzyme/types/Date.js';

/**
 * Parses an ISO 8601 duration string (e.g., 'P1Y2M3DT4H5M6S') or a string into a date-fns Duration object.
 * Supports years, months, days, hours, minutes, and seconds.
 *
 * @param duration - The ISO 8601 duration string or string to parse.
 * @returns The parsed Duration object with properties for each unit.
 * @throws {Error} If the input is not a valid ISO 8601 duration string.
 * @__NO_SIDE_EFFECTS__
 */
export function parseDuration(duration: DurationISO | StringNonLiteral): Duration {
    if (typeof duration !== 'string') {
        throw new Error('Duration must be a string');
    }
    // ISO 8601 duration regex: PnYnMnDTnHnMnS
    const regex = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
    const match = duration.match(regex);
    if (!match) {
        throw new Error(`Invalid ISO 8601 duration: ${duration}`);
    }
    // If all groups are undefined, it's an empty duration (P or PT)
    const [, years, months, days, hours, minutes, seconds] = match;
    if (!years && !months && !days && !hours && !minutes && !seconds) {
        return {};
    }
    const result: Duration = {};
    if (years) {
        result.years = Number(years);
    }
    if (months) {
        result.months = Number(months);
    }
    if (days) {
        const nDays = Number(days);
        if (nDays % 7 === 0) {
            result.weeks = nDays / 7;
        } else {
            result.days = nDays;
        }
    }
    if (hours) {
        result.hours = Number(hours);
    }
    if (minutes) {
        result.minutes = Number(minutes);
    }
    if (seconds) {
        result.seconds = Number(seconds);
    }
    return result;
}
