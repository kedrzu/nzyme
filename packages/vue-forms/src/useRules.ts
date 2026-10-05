import { arrayRemove } from '@nzyme/utils/array/arrayRemove.js';
import { assertValue } from '@nzyme/utils/assert.js';
import type { Rule } from '@nzyme/validation/rules/Rule.js';
import { validateRules } from '@nzyme/validation/rules/validateRules.js';
import { concatKeys } from '@nzyme/validation/utils/concatKeys.js';
import type { ValidationContext, ValidationErrors } from '@nzyme/validation/Validator.js';
import { computed, onScopeDispose, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { ensureRulesState } from './rules/ensureRulesState.js';
import type { FormNodeState, RuleRegistration } from './rules/FormNodeState.js';
import { getFormNodeState } from './rules/FormNodeState.js';
import type { FormModel } from './types.js';

/**
 * Options of `useRules` without a custom context: the rule gets `{ lang: form.lang }`.
 */
export interface UseRulesOptions {
    /**
     * Dotted path prefixes (relative to the form value) where the rule stops, typically because another
     * `useRules` registered lower in the tree validates that subtree. `'*'` matches one segment.
     */
    stopAt?: readonly string[];
}

/**
 * Options of `useRules` with the context the rule needs.
 */
export interface UseRulesContextOptions<C extends ValidationContext> extends UseRulesOptions {
    /**
     * Validation context passed to the rule; re-validates when it changes.
     */
    ctx: MaybeRefOrGetter<C>;
}

/**
 * Runs a rule from `@nzyme/validation` reactively over a form node's value and hands each message to
 * the field it belongs to, so the same rule that validates a value in one pass on the backend drives
 * field errors in the form.
 *
 * A message goes to the deepest field whose key path matches the message's path (an alias field —
 * no key, no own value — wins over its parent); without such a field it goes to the nearest ancestor,
 * and ultimately to `form` itself. It then behaves like any validator error of that field: it shows
 * after the field is edited and blurred or after `validate()`, and it makes `valid`, `invalid` and
 * `validate()` fail. All messages, shown or not, are also published in `ruleErrors` of `form` and of
 * every node above it.
 *
 * The registration lives as long as the calling effect scope.
 */
export function useRules<T>(form: FormModel<T>, rule: Rule<T>, options?: UseRulesOptions): void;
/**
 * Runs a rule that needs its own validation context. See the overload without `ctx`.
 */
export function useRules<T, C extends ValidationContext>(
    form: FormModel<T>,
    rule: Rule<T, C>,
    options: UseRulesContextOptions<C>,
): void;
/**
 * Implementation of useRules.
 * @internal
 */
export function useRules<T>(
    form: FormModel<T>,
    rule: Rule<T>,
    options: Partial<UseRulesContextOptions<ValidationContext>> = {},
): void {
    const state = getFormNodeState(form);
    const stopAt = options.stopAt;

    const errors = computed(() => {
        const ctx = options.ctx ? toValue(options.ctx) : { lang: form.lang };
        return validateRules(form.value, rule, ctx, { stopAt });
    });

    const receivers = computed(() => indexReceivers(form));
    const routed = computed(() => routeMessages(errors.value, receivers.value));

    const registration: RuleRegistration = { errors, routed };
    state.registrations.push(registration);

    onScopeDispose(() => {
        arrayRemove(state.registrations, registration);
    }, true);

    // Fields created later get their rule state on creation; the node and its existing fields get it now.
    visitReceivers(form, receiver => ensureRulesState(receiver.state));
}

interface Receiver {
    readonly node: FormModel;
    readonly state: FormNodeState;
    readonly path: string;
    readonly depth: number;
}

/**
 * Maps each dotted path in the node's subtree to the deepest node holding it.
 */
function indexReceivers(node: FormModel) {
    const index = new Map<string, Receiver>();

    visitReceivers(node, receiver => {
        const existing = index.get(receiver.path);
        // On a tie (two fields with the same key) the first registered keeps the path.
        if (!existing || existing.depth < receiver.depth) {
            index.set(receiver.path, receiver);
        }
    });

    return index;
}

/**
 * Visits the node and every field below it that rules registered on the node can address, with the
 * field's path relative to the node. Paths come from field keys; an alias adds no segment, so it
 * shares (and, being deeper, shadows) its parent's path; an opaque field and its children are skipped.
 */
function visitReceivers(node: FormModel, visit: (receiver: Receiver) => void) {
    visitWithChildren({ node, state: getFormNodeState(node), path: '', depth: 0 });

    function visitWithChildren(receiver: Receiver) {
        visit(receiver);

        for (const field of receiver.node.fields) {
            const state = getFormNodeState(field);
            if (state.addressable) {
                visitWithChildren({
                    node: field,
                    state,
                    path: field.key == null ? receiver.path : concatKeys(receiver.path, field.key),
                    depth: receiver.depth + 1,
                });
            }
        }
    }
}

function routeMessages(errors: ValidationErrors | null, receivers: ReadonlyMap<string, Receiver>) {
    const routed = new Map<FormNodeState, string[]>();
    if (!errors) {
        return routed;
    }

    for (const [path, messages] of Object.entries(errors)) {
        if (!messages) {
            continue;
        }

        const receiver = findReceiver(receivers, path);
        const existing = routed.get(receiver);
        if (existing) {
            existing.push(...messages);
        } else {
            routed.set(receiver, [...messages]);
        }
    }

    return routed;
}

/**
 * Finds the receiver of a message path: the path itself, else its nearest ancestor path, else the
 * node `useRules` is registered on (the empty path).
 */
function findReceiver(receivers: ReadonlyMap<string, Receiver>, path: string) {
    let current = path;
    while (current !== '') {
        const receiver = receivers.get(current);
        if (receiver) {
            return receiver.state;
        }

        const lastDot = current.lastIndexOf('.');
        current = lastDot === -1 ? '' : current.slice(0, lastDot);
    }

    return assertValue(receivers.get(''), 'The node useRules is registered on always receives its own path.').state;
}
