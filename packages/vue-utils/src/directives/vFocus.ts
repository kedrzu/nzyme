import type { ComponentPublicInstance, ObjectDirective } from 'vue';

import { unwrapElement } from '../unwrapElement.js';

/**
 * Directive that focuses an element when trigger is true.
 *
 * @example
 * <input v-focus="true" />
 * <textarea v-focus="true" />
 */
export const vFocus: ObjectDirective<ComponentPublicInstance | Element, boolean | null | undefined> = {
    mounted: (el, binding) => focusIf(el, binding.value),
    updated: (el, binding) => focusIf(el, binding.value && binding.oldValue !== binding.value),
};

function focusIf(el: ComponentPublicInstance | Element | undefined, value: boolean | null | undefined) {
    if (!el || !value) {
        return;
    }

    const element = unwrapElement(el);
    if (element && 'focus' in element) {
        setTimeout(() => element.focus(), 50);
    }
}
