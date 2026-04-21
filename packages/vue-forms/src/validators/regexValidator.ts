import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Regex validator options
 */
export interface RegexValidatorOptions {
    /**
     * Regex pattern to match against
     */
    regex: MaybeRefOrGetter<RegExp>;

    /**
     * Custom error message function
     */
    message?: (value: string, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Regex validator that checks if the value matches a given regular expression
 * @param options - Validator options
 */
export function regexValidator(options: RegexValidatorOptions) {
    const regex = makeRef(options.regex);

    return defineValidator<string>({
        async: false,
        validate: (value, ctx) => {
            if (!value) {
                return;
            }

            if (regex.value.test(value)) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.invalidFormat(ctx.lang);
        },
    });
}
