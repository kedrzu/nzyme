import { createRule } from '@regle/core';

/**
 * Regex validator that checks if the value matches a given regular expression
 * @param params - Parameters including regex pattern and optional message
 * @returns Regle validation rule
 */
export function regexValidator(params: { message?: string | (() => string); regex: RegExp }) {
    return createRule({
        type: 'regex',
        validator: (value: unknown) => validateRegex(value, params.regex),
        message: params.message || 'Nieprawidłowy format.',
    });
}

/**
 * Validates if the value matches the regex pattern
 * @param value - The value to validate
 * @param regex - The regex pattern to match against
 * @returns True if valid or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateRegex(value: unknown, regex: RegExp) {
    if (!value) {
        return true;
    }

    if (typeof value === 'string') {
        return regex.test(value);
    }

    return false;
}
