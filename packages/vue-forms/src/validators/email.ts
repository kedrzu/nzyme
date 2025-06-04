import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

import { isEmailValid } from '@nzyme/validation';

/**
 * Email validator that checks if the value is a valid email address
 * @param params - Optional parameters including custom message
 * @returns Regle validation rule
 */
export const email = createRule({
    type: 'email',
    validator: validateEmail,
    // TODO translation
    message: 'Adres e-mail jest nieprawidłowy',
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
