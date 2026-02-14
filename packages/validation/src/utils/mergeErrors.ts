import type { ValidationErrors, ValidationResult } from '../Validator.js';
import { concatKeys } from './concatKeys.js';

/**
 *
 */
export function mergeErrors(errors: ValidationErrors, result: ValidationResult, key: number | string = '') {
    if (result == null) {
        return errors;
    }

    if (Array.isArray(result)) {
        if (result.length === 0) {
            return errors;
        }

        const existing = errors[key];
        if (existing != null) {
            existing.push(...result);
        } else {
            errors[key] = result;
        }

        return errors;
    }

    if (typeof result === 'string') {
        if (result === '') {
            return errors;
        }

        const existing = errors[key];
        if (existing != null) {
            existing.push(result);
        } else {
            errors[key] = [result];
        }

        return errors;
    }

    for (const k in result) {
        mergeErrors(errors, result[k], concatKeys(key, k));
    }

    return errors;
}
