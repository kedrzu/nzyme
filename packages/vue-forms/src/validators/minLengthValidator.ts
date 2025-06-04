import { createRule } from '@regle/core';

/**
 * Minimum length validator that checks if the value has at least the specified length
 * @param params - Parameters including minimum length and optional message
 * @returns Regle validation rule
 */
export function minLengthValidator(params: { message?: () => string; min: number }) {
    return createRule({
        type: 'minLength',
        validator: (value: unknown) => validateMinLength(value, params.min),
        message: params.message || `Minimalna długość to ${params.min} znaków`,
    });
}

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
