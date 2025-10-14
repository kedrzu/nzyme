import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';
import { isEmailValid } from '@nzyme/validation';

import * as l from './validators.loc.js';

/**
 * Email validator that checks if the value is a valid email address
 * @param params - Optional parameters including custom message
 * @returns Regle validation rule
 */
export const email = createRule({
    type: 'email',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(value: unknown, lang: Language) {
        return validateEmail(value);
    },
    message: ({ $params: [lang] }) => translateToString(l.invalidEmail, lang),
});

/**
 * Validates if the value is a valid email address
 * @param value - The value to validate
 * @returns True if valid email, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateEmail(value: unknown) {
    if (!isFilled(value)) {
        return true;
    }

    if (typeof value !== 'string') {
        return false;
    }

    return isEmailValid(value);
}
