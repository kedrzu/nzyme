import { deepEquals } from '@nzyme/utils/deepEquals.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import { computed, ref } from 'vue';

import { showErrorsOnBlurBehavior } from '../behaviors/showErrorsOnBlurBahavior.js';
import type { FormValidatorState } from '../types.js';
import { collectRuleRegistrations } from './collectRuleRegistrations.js';
import type { FormNodeState } from './FormNodeState.js';

/**
 * Gives a node the validator state that receives its routed `useRules` messages, unless it has one.
 * The state is created in the node's own effect scope, so it is disposed together with the node,
 * and it is appended to the field's validators, so `errors`, `valid`, `invalid`, `validate()` and
 * `reset()` treat rule messages like any other validator's error.
 * @internal
 */
export function ensureRulesState(state: FormNodeState) {
    if (state.rules.value) {
        return;
    }

    const scope = state.scope;
    if (scope && !scope.active) {
        // The node is being disposed; it is about to leave the tree anyway.
        return;
    }

    const rules = scope ? scope.run(() => createRulesValidatorState(state)) : createRulesValidatorState(state);
    if (!rules) {
        return;
    }

    state.rules.value = rules;
    state.validators?.push(rules);
}

function createRulesValidatorState(state: FormNodeState) {
    // Keeps the previous array while the content is the same, so an edit that does not change
    // this node's messages does not re-render it.
    const messages = computed<readonly string[]>(previous => {
        const next = collectRoutedMessages(state);
        return previous && deepEquals(previous, next) ? previous : next;
    });

    const error = computed(() => messages.value[0] ?? null);
    const show = ref(false);

    showErrorsOnBlurBehavior({ value: state.value, focused: state.focused, show });

    return reactive<FormValidatorState>({
        error,
        messages,
        show,
        validate: () => {
            show.value = true;
            return messages.value.length === 0;
        },
    });
}

function collectRoutedMessages(state: FormNodeState) {
    const messages: string[] = [];
    for (const registration of collectRuleRegistrations(state)) {
        const routed = registration.routed.value.get(state);
        if (routed) {
            messages.push(...routed);
        }
    }

    return messages;
}
