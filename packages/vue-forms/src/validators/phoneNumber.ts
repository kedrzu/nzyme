import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Phone number validator that checks if the value is a valid phone number
 * @returns Regle validation rule
 */
export const phoneNumber = createRule({
    type: 'phoneNumber',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(value: string | null | undefined, lang: Language) {
        return validatePhoneNumber(value);
    },
    message: ({ $params: [lang] }) => translateToString(l.invalidPhoneNumber, lang),
});

/**
 * Validates if the value is a valid phone number
 * @param value - The value to validate
 * @returns Promise that resolves to true if valid, false otherwise
 */
async function validatePhoneNumber(value: string | null | undefined) {
    const phone = value?.toString();
    if (!phone) {
        // ignore this validation
        return true;
    }

    const { parsePhoneNumberWithError } = await import('libphonenumber-js');

    try {
        const number = parsePhoneNumberWithError(phone);
        return !!number.country && !!number.isValid();
    } catch {
        return false;
    }
}
