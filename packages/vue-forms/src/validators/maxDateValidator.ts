import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Maximum date validator that checks if the value is at most the specified maximum date
 * @param params - Parameters including maximum date and language
 * @returns Regle validation rule
 */
export const maxDateValidator = createRule({
    type: 'maxDate',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator: (value: unknown, maxDate: Date, lang: Language) => validateMaxDate(value, maxDate),
    message: ({ $params: [maxDate, lang] }) =>
        translateToString(l.maxDateExceeded, lang, {
            maxDate: maxDate.toLocaleDateString(),
        }),
});

/**
 * Validates if the value is at most the maximum date
 * @param value - The value to validate
 * @param max - The maximum allowed date
 * @returns True if valid date or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateMaxDate(value: unknown, max: Date) {
    if (value == null) {
        return true;
    }

    if (value instanceof Date) {
        return value <= max;
    }

    return false;
}
