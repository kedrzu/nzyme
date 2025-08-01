import type { ComponentPublicInstance } from 'vue';

import type { ElementOrVue } from './types.js';

type VueInstance = ComponentPublicInstance;
type MaybeElement = ElementOrVue | null | undefined;
type UnwrappedElement<T extends MaybeElement> = T extends VueInstance
    ? Exclude<MaybeElement, VueInstance>
    : T | undefined;

/**
 * Unwraps an element from either a DOM element or Vue component instance.
 * If the input is a Vue component instance, returns its $el property.
 * Otherwise, returns the element as is.
 *
 * @param el - The element or Vue instance to unwrap
 * @returns The unwrapped DOM element or undefined if input is null/undefined
 *
 * @__NO_SIDE_EFFECTS__
 */
export function unwrapElement<T extends MaybeElement>(el: T | null | undefined): UnwrappedElement<T> {
    if (!el) {
        return undefined as UnwrappedElement<T>;
    }

    return ((el as ComponentPublicInstance).$el ?? el) as UnwrappedElement<T>;
}
