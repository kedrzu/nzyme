import type { FormNodeState, RuleRegistration } from './FormNodeState.js';

/**
 * Collects every `useRules` registration that can route messages to a node: the node's own and
 * those of its ancestors, up to the first node opaque to routing (a field with its own value and no
 * key) — registrations above it cannot address anything below it.
 * @internal
 * @__NO_SIDE_EFFECTS__
 */
export function collectRuleRegistrations(state: FormNodeState): RuleRegistration[] {
    const registrations: RuleRegistration[] = [];

    let current: FormNodeState | null = state;
    while (current) {
        registrations.push(...current.registrations);
        if (!current.addressable) {
            break;
        }

        current = current.parent;
    }

    return registrations;
}
