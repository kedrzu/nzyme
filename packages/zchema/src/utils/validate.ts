import { mergeErrors, normalizeErrors, ValidationError } from '@nzyme/validation';
import type { ValidationContext, ValidationErrors, ValidationResult } from '@nzyme/validation';

import type { Infer, SchemaAny, SchemaVisitor } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

/**
 * Validates a value against a schema and returns any validation errors.
 * @template S - The schema type
 * @param schema - The schema to validate against
 * @param value - The value to validate
 * @param ctx - Optional validation context
 * @returns Normalized validation errors, or undefined if the value is valid
 */
export function validate<S extends SchemaAny>(schema: S, value: Infer<S>, ctx: ValidationContext = {}) {
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
export function validateOrThrow<S extends SchemaAny>(schema: S, value: Infer<S>, ctx: ValidationContext = {}) {
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
): ValidationResult | undefined {
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
    } else if (!proto.check(value, ctx)) {
        return ['Invalid value'];
    }

    let errors: ValidationErrors | undefined;

    if (value != null && proto.visit != null) {
        const visitor: SchemaVisitor = (schema, value, key) => {
            const result = validateInner(schema, value, ctx);

            if (!result) {
                return;
            }

            if (errors === undefined) {
                errors = {};
            }

            mergeErrors(errors, result, key);
        };

        proto.visit(value, visitor, ctx);
    }

    for (const validator of schema.validate) {
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
