import { createRule } from '@regle/core';

/**
 * Minimum date validator that checks if the value is at least the specified minimum date
 * @param params - Parameters including minimum date and message
 * @returns Regle validation rule
 */
export function minDateValidator(params: { message: () => string; min: Date }) {
    return createRule({
        type: 'minDate',
        validator: (value: unknown) => validateMinDate(value, params.min),
        message: params.message,
    });
}

/**
 * Validates if the value is at least the minimum date
 * @param value - The value to validate
 * @param min - The minimum required date
 * @returns True if valid date or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateMinDate(value: unknown, min: Date) {
    if (value == null) {
        return true;
    }

    if (value instanceof Date) {
        return value >= min;
    }

    return false;
}
