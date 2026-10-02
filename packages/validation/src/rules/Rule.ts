import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Validation rule for a single node of a tree.
 * A rule validates its own fields and delegates to child rules through the visitor, so the same rule
 * can run as a deep walk (`validateRules`) or per node where only one level is needed.
 * Anything a rule needs from outside its node must come through `ctx` — the visitor carries no cross-node state.
 */
export type Rule<T, C extends ValidationContext = ValidationContext> = (node: T, v: RuleVisitor<C>, ctx: C) => void;

/**
 * Operations a rule uses to report errors and descend into children.
 * All paths are relative to the node the rule was called for.
 *
 * Keys are typed one `keyof` level deep on purpose — schema-derived recursive key types proved unmaintainable.
 */
export interface RuleVisitor<C extends ValidationContext = ValidationContext> {
    /**
     * Runs every validator on `node[key]` (no short-circuit) and reports messages at `key`.
     * An object result (ValidationErrors) nests further under `key`.
     */
    field<N extends object, K extends StringKeys<N>>(node: N, key: K, ...validators: Validator<N[K], C>[]): void;
    /**
     * Descends into an object child. Skipped when the child is null or undefined.
     */
    nested<N extends object, K extends StringKeys<N>>(node: N, key: K, rule: Rule<NonNullable<N[K]>, C>): void;
    /**
     * Descends into each item of an array child, reporting at `key.<index>`. Skipped when the array is null or undefined.
     */
    each<N extends object, K extends ArrayKeys<N>>(node: N, key: K, rule: Rule<ArrayItem<N[K]>, C>): void;
    /**
     * Reports a message at `key`, or at the current node when `key` is null.
     */
    error(key: string | null, message: string): void;
}

/**
 * String keys of `N` — the ones that can form a dotted error path.
 */
export type StringKeys<N> = keyof N & string;

/**
 * String keys of `N` whose value is an array (optionally null or undefined).
 */
export type ArrayKeys<N> = {
    [K in StringKeys<N>]-?: NonNullable<N[K]> extends readonly unknown[] ? K : never;
}[StringKeys<N>];

/**
 * Item type of a (possibly null or undefined) array type.
 */
export type ArrayItem<A> = NonNullable<A> extends readonly (infer I)[] ? I : never;
