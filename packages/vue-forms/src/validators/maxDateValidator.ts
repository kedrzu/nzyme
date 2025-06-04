import { createRule } from '@regle/core';

/**
 * Maximum date validator that checks if the value is at most the specified maximum date
 * @param params - Parameters including maximum date and message
 * @returns Regle validation rule
 */
export function maxDateValidator(params: { max: Date; message: () => string }) {
    return createRule({
        type: 'maxDate',
        validator: (value: unknown) => validateMaxDate(value, params.max),
        message: params.message,
    });
}

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
