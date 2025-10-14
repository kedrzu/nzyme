import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Minimum date validator that checks if the value is at least the specified minimum date
 * @returns Regle validation rule
 */
export const minDateValidator = createRule({
    type: 'minDate',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator: (value: unknown, minDate: Date, lang: Language) => validateMinDate(value, minDate),
    message: ({ $params: [minDate, lang] }) =>
        translateToString(l.minDateNotMet, lang, {
            minDate: minDate.toLocaleDateString(),
        }),
});

/**
 * Validates if the value is at least the minimum date
 * @param value - The value to validate
 * @param min - The minimum required date
 * @returns True if valid date or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateMinDate(value: unknown, min: Date) {
    if (value == null) {
        return true;
    }

    if (value instanceof Date) {
        return value >= min;
    }

    return false;
}
