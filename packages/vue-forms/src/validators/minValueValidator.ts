import { createRule } from '@regle/core';

/**
 * Minimum value validator that checks if the value is at least the specified minimum
 * @param params - Parameters including minimum value and optional message
 * @returns Regle validation rule
 */
export function minValueValidator(params: { message?: () => string; min: number }) {
    return createRule({
        type: 'minValue',
        validator: (value: unknown) => validateMinValue(value, params.min),
        message: params.message || `Minimalna wartość to ${params.min}`,
    });
}

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
