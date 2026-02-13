import type { Duration } from 'date-fns';

import type { DurationISO } from '@nzyme/types/Date.js';

/**
 * Converts a date-fns Duration object to an ISO 8601 duration string (e.g., 'P1Y2M3DT4H5M6S').
 * Only years, months, days, hours, minutes, and seconds are supported.
 * If weeks are present, they are converted to days (1 week = 7 days).
 *
 * @param duration - The duration object to stringify
 * @returns The ISO 8601 duration string
 * @throws {Error} If the input is not a valid duration object
 * @__NO_SIDE_EFFECTS__
 */
export function stringifyDuration(duration: Duration): DurationISO {
    if (!duration || typeof duration !== 'object') {
        throw new Error('Invalid duration object');
    }

    const { years, months, weeks, hours, minutes, seconds } = duration;
    let { days } = duration;

    // Convert weeks to days
    if (typeof weeks === 'number') {
        days = (typeof days === 'number' ? days : 0) + weeks * 7;
    }

    // Build date part
    const y = typeof years === 'number' ? `${years}Y` : '';
    const m = typeof months === 'number' ? `${months}M` : '';
    const d = typeof days === 'number' ? `${days}D` : '';
    const datePart = `${y}${m}${d}`;

    // Build time part
    const h = typeof hours === 'number' ? `${hours}H` : '';
    const min = typeof minutes === 'number' ? `${minutes}M` : '';
    const s = typeof seconds === 'number' ? `${seconds}S` : '';
    const timePart = `${h}${min}${s}`;

    if (!datePart && !timePart) {
        return 'P';
    }

    if (!datePart && timePart) {
        return `PT${timePart}` as DurationISO;
    }

    if (datePart && !timePart) {
        return `P${datePart}` as DurationISO;
    }

    return `P${datePart}T${timePart}` as DurationISO;
}
