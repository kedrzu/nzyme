import { add } from 'date-fns';
import type { Duration } from 'date-fns';
import { vitest } from 'vitest';

/**
 *
 */
export function advanceTime(duration: Duration) {
    const newDate = add(new Date(), duration);
    vitest.setSystemTime(newDate);
    return newDate;
}
