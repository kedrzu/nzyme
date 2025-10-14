import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Minimum value validator that checks if the value is at least the specified minimum
 * @returns Regle validation rule
 */
export const minValueValidator = createRule({
    type: 'minValue',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator: (value: unknown, minValue: number, lang: Language) => validateMinValue(value, minValue),
    message: ({ $params: [minValue, lang] }) =>
        translateToString(l.minValueNotMet, lang, {
            minValue: minValue.toString(),
        }),
});

/**
 * Validates if the value is at least the minimum value
 * @param value - The value to validate
 * @param min - The minimum required value
 * @returns True if valid value or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateMinValue(value: unknown, min: number) {
    if (value == null) {
        return true;
    }

    if (typeof value === 'number') {
        return value >= min;
    }

    return false;
}
