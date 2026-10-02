import { assert } from '@nzyme/utils/assert.js';
import type { ValidationErrors } from '@nzyme/validation/Validator.js';
import { toRaw } from 'vue';
import type { ComputedRef, EffectScope, Ref, ShallowRef } from 'vue';

import type { FormModel, FormValidatorState } from '../types.js';

/**
 * Internal state of a form node (a `useForm` root or a `useFormField` field) that `useRules` needs
 * but the public model does not expose: how the node sits in the routing tree and where its rule
 * messages are delivered.
 * @internal
 */
export interface FormNodeState {
    /**
     * State of the parent node; null for a root form.
     */
    readonly parent: FormNodeState | null;

    /**
     * Whether messages of rules registered above can be routed into this node. False for a field with
     * its own value and no key — its value has no path relative to the parent.
     */
    readonly addressable: boolean;

    /**
     * Effect scope the node was created in. The node's rule validator state is created there, so
     * disposing the node (e.g. deleting an array item) disposes its watchers too.
     */
    readonly scope: EffectScope | undefined;

    /**
     * Node value, watched by the rule validator state's show behavior.
     */
    readonly value: Readonly<Ref<unknown>>;

    /**
     * Whether the node is focused, watched by the rule validator state's show behavior.
     */
    readonly focused: Readonly<Ref<boolean>>;

    /**
     * The field's (shallow reactive) validator list, or null for a root form, which has none and keeps
     * its rule validator state only in `rules`.
     */
    readonly validators: FormValidatorState[] | null;

    /**
     * `useRules` registrations made on this node (shallow reactive).
     */
    readonly registrations: RuleRegistration[];

    /**
     * Validator state that receives the rule messages routed to this node. Created only once a rule
     * registered on the node or above it can route here, so forms without rules keep their validators.
     */
    readonly rules: ShallowRef<FormValidatorState | null>;
}

/**
 * A single `useRules` call registered on a node.
 * @internal
 */
export interface RuleRegistration {
    /**
     * Rule errors keyed by dotted path relative to the node the rule is registered on.
     */
    readonly errors: ComputedRef<ValidationErrors | null>;

    /**
     * The same messages, grouped by the node that receives them.
     */
    readonly routed: ComputedRef<ReadonlyMap<FormNodeState, readonly string[]>>;
}

const states = new WeakMap<FormModel, FormNodeState>();

/**
 * Attaches internal state to a form node. Called once, by `useForm` / `useFormField`.
 * @internal
 */
export function setFormNodeState(node: FormModel, state: FormNodeState) {
    states.set(toRaw(node), state);
}

/**
 * Reads the internal state of a form node created by `useForm` / `useFormField`.
 * @internal
 * @__NO_SIDE_EFFECTS__
 */
export function getFormNodeState(node: FormModel): FormNodeState {
    const state = states.get(toRaw(node));
    assert(state, 'Form node was not created by useForm or useFormField.');

    return state;
}
