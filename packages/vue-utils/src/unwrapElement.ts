import type { ComponentPublicInstance } from 'vue';

import type { ElementOrVue } from './types.js';

type VueInstance = ComponentPublicInstance;
type MaybeElement = ElementOrVue | null | undefined;
type UnwrappedElement<T extends MaybeElement> = T extends VueInstance
    ? Exclude<MaybeElement, VueInstance>
    : T | undefined;

/**
 *
 */
export function unwrapElement<T extends MaybeElement>(el: T | null | undefined): UnwrappedElement<T> {
    if (!el) {
        return undefined as UnwrappedElement<T>;
    }

    return ((el as ComponentPublicInstance).$el ?? el) as UnwrappedElement<T>;
}
