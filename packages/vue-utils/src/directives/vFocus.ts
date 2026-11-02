import type { ComponentPublicInstance, ObjectDirective } from 'vue';

import { unwrapElement } from '../unwrapElement.js';

/**
 * Directive that focuses an element when trigger is true. The focus is applied after a short delay, and
 * only if focus did not move to another element in the meantime.
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
    if (!element || !('focus' in element)) {
        return;
    }

    const document = 'ownerDocument' in element ? element.ownerDocument : element.document;
    const activeBefore = document.activeElement;
    setTimeout(() => {
        // Focus that moved during the delay was moved on purpose — by the user, or a test filling the
        // next field. Taking it back would send what they type next into this element.
        if (document.activeElement !== activeBefore) {
            return;
        }

        element.focus();
    }, 50);
}
