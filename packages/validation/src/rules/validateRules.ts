import { isArray } from '@nzyme/utils/array/isArray.js';

import { concatKeys } from '../utils/concatKeys.js';
import { mergeErrors } from '../utils/mergeErrors.js';
import { normalizeErrors } from '../utils/normalizeErrors.js';
import type { ValidationContext, ValidationErrors, ValidationResult, Validator } from '../Validator.js';
import type { ArrayItem, ArrayKeys, Rule, RuleVisitor, StringKeys } from './Rule.js';

/**
 * Options for `validateRules`.
 */
export interface ValidateRulesOptions {
    /**
     * Dotted path prefixes (relative to the validated value) where validation stops.
     * A pruned subtree is not descended, and any message whose path falls under it is dropped.
     * `'*'` matches exactly one path segment, e.g. `steps.*.options`.
     */
    stopAt?: readonly string[];
}

/**
 * Runs a rule over a value as a deep, synchronous walk and collects messages at full dotted paths.
 * @returns Errors keyed by dotted path, or null when the value is valid.
 */
export function validateRules<T, C extends ValidationContext>(
    value: T,
    rule: Rule<T, C>,
    ctx: C,
    options: ValidateRulesOptions = {},
): ValidationErrors | null {
    const stopAt = (options.stopAt ?? []).map(splitPath);
    const errors: ValidationErrors = {};

    rule(value, createVisitor(''), ctx);

    return normalizeErrors(errors);

    function createVisitor(path: string): RuleVisitor<C> {
        return { field, nested, each, error };

        function field<N extends object, K extends StringKeys<N>>(
            node: N,
            key: K,
            ...validators: Validator<N[K], C>[]
        ) {
            const fieldPath = concatKeys(path, key);
            if (isPruned(fieldPath)) {
                return;
            }

            const fieldValue = node[key];
            for (const validator of validators) {
                collect(validator(fieldValue, ctx), fieldPath);
            }
        }

        function nested<N extends object, K extends StringKeys<N>>(
            node: N,
            key: K,
            childRule: Rule<NonNullable<N[K]>, C>,
        ) {
            const childPath = concatKeys(path, key);
            const child = node[key];
            if (child == null || isPruned(childPath)) {
                return;
            }

            childRule(child, createVisitor(childPath), ctx);
        }

        function each<N extends object, K extends ArrayKeys<N>>(
            node: N,
            key: K,
            itemRule: Rule<ArrayItem<N[K]>, C>,
        ): void;
        // `ArrayKeys` guarantees `node[key]` is an array of `ArrayItem<N[K]>`, but TypeScript cannot follow
        // that through generic indexed access, so the implementation sees the items as `unknown`.
        function each<N extends object, K extends ArrayKeys<N>>(node: N, key: K, itemRule: Rule<unknown, C>) {
            const arrayPath = concatKeys(path, key);
            const items = node[key];
            if (!isArray(items) || isPruned(arrayPath)) {
                return;
            }

            for (const [index, item] of items.entries()) {
                const itemPath = concatKeys(arrayPath, index);
                if (!isPruned(itemPath)) {
                    itemRule(item, createVisitor(itemPath), ctx);
                }
            }
        }

        function error(key: string | null, message: string) {
            collect(message, concatKeys(path, key));
        }
    }

    function collect(result: ValidationResult, path: string) {
        const found = mergeErrors({}, result, path);
        for (const [key, messages] of Object.entries(found)) {
            if (messages != null && !isPruned(key)) {
                // Copy, because mergeErrors keeps the array reference and later pushes would mutate the validator's result.
                mergeErrors(errors, [...messages], key);
            }
        }
    }

    function isPruned(path: string) {
        const segments = splitPath(path);
        return stopAt.some(prefix => isPrefixOf(prefix, segments));
    }
}

function splitPath(path: string) {
    return path === '' ? [] : path.split('.');
}

function isPrefixOf(prefix: readonly string[], segments: readonly string[]) {
    if (prefix.length > segments.length) {
        return false;
    }

    return prefix.every((segment, index) => segment === '*' || segment === segments[index]);
}
