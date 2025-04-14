import {
    mergeErrors,
    normalizeErrors,
    type ValidationContext,
    ValidationError,
    type ValidationErrors,
    type ValidationResult,
} from '@nzyme/validation';

import type { Infer, SchemaAny } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

/**
 * Validates a value against a schema and returns any validation errors.
 * @template S - The schema type
 * @param schema - The schema to validate against
 * @param value - The value to validate
 * @param ctx - Optional validation context
 * @returns Normalized validation errors, or undefined if the value is valid
 */
export function validate<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    ctx: ValidationContext = {},
) {
    const errors = validateInner(schema, value, ctx);
    return normalizeErrors(errors);
}

/**
 * Validates a value against a schema and throws a ValidationError if invalid.
 * @template S - The schema type
 * @param schema - The schema to validate against
 * @param value - The value to validate
 * @param ctx - Optional validation context
 * @throws {ValidationError} If the value is invalid
 */
export function validateOrThrow<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    ctx: ValidationContext = {},
) {
    const result = validate(schema, value, ctx);
    if (result != null) {
        throw new ValidationError(result);
    }
}

/**
 * Internal function that performs the actual validation logic.
 * @template S - The schema type
 * @param schema - The schema to validate against
 * @param value - The value to validate
 * @param ctx - Validation context
 * @returns Raw validation errors, or undefined if the value is valid
 */
function validateInner<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    ctx: ValidationContext,
): undefined | ValidationResult {
    lazyResolve(schema);

    const proto = schema.proto;

    if (value === null) {
        if (!schema.nullable) {
            return ['Invalid value'];
        }
    } else if (value === undefined) {
        if (!schema.optional) {
            return ['Invalid value'];
        }
    } else if (!proto.check(value)) {
        return ['Invalid value'];
    }

    let errors: undefined | ValidationErrors;

    if (value != null && proto.visit != null) {
        proto.visit(value, (schema, value, key) => {
            const result = validateInner(schema, value, ctx);

            if (!result) {
                return;
            }

            if (errors === undefined) {
                errors = {};
            }

            mergeErrors(errors, result, key);
        });
    }

    for (const validator of schema.validators) {
        const result = validator(value, ctx);
        if (result != null) {
            if (errors === undefined) {
                errors = {};
            }

            mergeErrors(errors, result);

            break;
        }
    }

    return errors;
}
