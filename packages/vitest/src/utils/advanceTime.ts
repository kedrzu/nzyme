import { add } from 'date-fns';
import type { Duration } from 'date-fns';
import { vitest } from 'vitest';

/** Advances the fake system time by the given duration and returns the new date. */
export function advanceTime(duration: Duration) {
    const newDate = add(new Date(), duration);
    vitest.setSystemTime(newDate);
    return newDate;
}
