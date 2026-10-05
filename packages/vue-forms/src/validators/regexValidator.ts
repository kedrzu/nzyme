import { regex } from '@nzyme/validation/validators/regex.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

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
    const pattern = makeRef(options.regex);

    return defineValidator<string>({
        async: false,
        validate: fromRule((value, ctx) => regex(pattern.value)(value, ctx), options),
    });
}
