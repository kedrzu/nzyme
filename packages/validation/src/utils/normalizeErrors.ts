import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { ValidationErrors, ValidationResult } from '../Validator.js';
import { mergeErrors } from './mergeErrors.js';

export function normalizeErrors(errors: ValidationResult): ValidationErrors | null {
    if (errors == null) {
        return null;
    }

    const normalized = isPlainObject(errors) ? errors : mergeErrors({}, errors);
    if (Object.keys(normalized).length === 0) {
        return null;
    }

    return normalized;
}
