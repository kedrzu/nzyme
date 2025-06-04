import { createRule } from '@regle/core';

/**
 * Post code validator that checks if the value is a valid postal code for the given country
 * @param params - Parameters including country and optional message
 * @returns Regle validation rule
 */
export const postCode = createRule({
    type: 'postCode',
    validator(value: string | null | undefined, country: string | null | undefined) {
        return validatePostCode(value, country);
    },
    message: 'Kod pocztowy jest niepoprawny.',
});

/**
 * Validates if the value is a valid postal code for the given country
 * @param value - The postal code to validate
 * @param country - The country code
 * @returns Promise that resolves to true if valid, false otherwise
 */
async function validatePostCode(value: string | null | undefined, country: string | null | undefined) {
    const postcode = value?.toString();
    if (!postcode || !country) {
        // ignore this validation
        return true;
    }

    const { validate } = await import('postal-codes-js');
    const result = validate(country, postcode);

    return result === true;
}
