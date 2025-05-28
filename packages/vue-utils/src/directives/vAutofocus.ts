import type { ObjectDirective } from 'vue';

/**
 * Directive that autofocuses an element when it is mounted.
 *
 * @example
 * <input v-autofocus />
 * <textarea v-autofocus />
 */
export const vAutofocus: ObjectDirective<Element, boolean | null | undefined> = {
    mounted(el, binding) {
        const disabled = binding.value === false;
        if (disabled) {
            return;
        }

        if (el instanceof HTMLElement) {
            setTimeout(() => el.focus());
        }
    },
};
