import type { ValidationErrors, Validator } from '@nzyme/validation/Validator.js';

import type { FormValidationContext, FormValidationResult } from '../types.js';

/**
 * Options accepted by {@link fromRule} and {@link fromRuleAsync} — a vue-forms-level message
 * override, applied only when the wrapped rule reports an error.
 */
export interface FromRuleOptions<T> {
    /**
     * Overrides the rule's default message. Only invoked when the rule produced an error.
     */
    message?: (value: T, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Wraps a synchronous `@nzyme/validation` rule as a vue-forms validate function.
 * `FormValidationContext` satisfies `ValidationContext` structurally (it carries `lang`), so it is
 * passed through to the rule as-is. Emptiness/skip logic stays entirely in the rule; this wrapper
 * only translates its result and applies a vue-forms-level message override on error.
 * @__NO_SIDE_EFFECTS__
 */
export function fromRule<T>(
    rule: Validator<T | null | undefined>,
    options: FromRuleOptions<T> = {},
): (value: T | null | undefined, ctx: FormValidationContext) => FormValidationResult {
    return (value, ctx) => {
        const result = rule(value, ctx);
        if (!result) {
            return undefined;
        }

        if (options.message && value != null) {
            return options.message(value, ctx);
        }

        return toFormValidationResult(result);
    };
}

/**
 * Wraps an async `@nzyme/validation` rule as a vue-forms validate function. `loadRule` resolves
 * the rule itself (typically behind a dynamic `import()`) so the caller controls whether — and
 * when — a heavy validation dependency gets loaded; returning `undefined` skips validation
 * entirely without ever loading the rule.
 * @__NO_SIDE_EFFECTS__
 */
export function fromRuleAsync<T>(
    loadRule: (value: T | null | undefined) => Promise<Validator<T | null | undefined> | undefined>,
    options: FromRuleOptions<T> = {},
): (value: T | null | undefined, ctx: FormValidationContext) => Promise<FormValidationResult> {
    return async (value, ctx) => {
        const rule = await loadRule(value);
        if (!rule) {
            return undefined;
        }

        return fromRule(rule, options)(value, ctx);
    };
}

/**
 * Converts an `@nzyme/validation` result (already known to be truthy) into `FormValidationResult`.
 * @__NO_SIDE_EFFECTS__
 */
export function toFormValidationResult(result: string | string[] | ValidationErrors): FormValidationResult {
    if (typeof result === 'string' || Array.isArray(result)) {
        return result;
    }

    return null;
}
