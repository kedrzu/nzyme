import { createRule } from '@regle/core';

/**
 * Phone number validator that checks if the value is a valid phone number
 * @returns Regle validation rule
 */
export const phoneNumber = createRule({
    type: 'phoneNumber',
    validator: validatePhoneNumber,
    message: 'Numer telefonu jest niepoprawny.',
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
