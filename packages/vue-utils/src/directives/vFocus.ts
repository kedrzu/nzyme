import type { ComponentPublicInstance, ObjectDirective } from 'vue';

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

    const element = el instanceof Element ? el : (el.$el as Element | undefined);
    if (element instanceof HTMLElement) {
        setTimeout(() => element.focus(), 50);
    }
}
