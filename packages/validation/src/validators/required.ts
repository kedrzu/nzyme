import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext, Validator, ValidatorMessage } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Options for the `required` validator.
 */
export interface RequiredOptions<T> {
    /**
     * Replaces the default emptiness check (`isFilled`); returns true when the value counts as filled.
     */
    test?: (value: T | null | undefined, ctx: ValidationContext) => boolean;
    /**
     * Overrides the default message.
     */
    message?: ValidatorMessage<T | null | undefined>;
}

/**
 * Creates a validator that fails when the value is missing or empty (see `isFilled`).
 * The only primitive that does not skip empty values — every other one leaves emptiness to this one.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function required<T>(options: RequiredOptions<T> = {}): Validator<T | null | undefined> {
    const test = options.test ?? isFilled;

    return (value, ctx) => {
        if (test(value, ctx)) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.required, ctx.lang ?? 'en');
    };
}

/**
 * Checks whether a value counts as filled: not null/undefined, not `false`, not a blank string and not an empty array.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isFilled(value: unknown): boolean {
    if (value == null || value === false) {
        return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return false;
    }

    if (Array.isArray(value) && value.length === 0) {
        return false;
    }

    return true;
}
