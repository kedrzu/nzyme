import {
    mergeErrors,
    normalizeErrors,
    ValidationError,
    type ValidationContext,
    type ValidationErrors,
    type ValidationResult,
} from '@nzyme/validation';

import type { SchemaAny, Infer } from '../Schema.js';
import { lazyResolve } from '../schemas/lazy.js';

export function validate<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    ctx: ValidationContext = {},
) {
    const errors = validateInner(schema, value, ctx);
    return normalizeErrors(errors);
}

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

function validateInner<S extends SchemaAny>(
    schema: S,
    value: Infer<S>,
    ctx: ValidationContext,
): ValidationResult {
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

    let errors: ValidationErrors | undefined;

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
