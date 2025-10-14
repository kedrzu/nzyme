import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Minimum length validator that checks if the value has at least the specified length
 * @returns Regle validation rule
 */
export const minLengthValidator = createRule({
    type: 'minLength',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator: (value: unknown, minLength: number, lang: Language) => validateMinLength(value, minLength),
    message: ({ $params: [minLength, lang] }) =>
        translateToString(l.minLengthNotMet, lang, {
            minLength: minLength.toString(),
        }),
});

/**
 * Validates if the value has at least the minimum length
 * @param value - The value to validate
 * @param min - The minimum required length
 * @returns True if valid length or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateMinLength(value: unknown, min: number) {
    if (value == null) {
        return true;
    }

    if (typeof value === 'string' || Array.isArray(value)) {
        return value.length >= min;
    }

    return false;
}
