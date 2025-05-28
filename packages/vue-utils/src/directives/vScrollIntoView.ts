import type { ObjectDirective } from 'vue';

/**
 *
 */
export type ScrollIntoViewDirectiveOptions = {
    /**
     *
     */
    options?: globalThis.ScrollIntoViewOptions;
    /**
     *
     */
    trigger?: boolean | number;
};

/**
 * Scroll into view directive.
 */
export const vScrollIntoView: ObjectDirective<Element, ScrollIntoViewDirectiveOptions | null | undefined> = {
    mounted(el, binding) {
        const enabled = isEnabled(binding.value?.trigger);
        if (enabled) {
            setTimeout(() => el.scrollIntoView(binding.value?.options));
        }
    },
    updated(el, binding) {
        const oldTrigger = binding.oldValue?.trigger;
        const newTrigger = binding.value?.trigger;

        if (oldTrigger === newTrigger) {
            return;
        }

        const enabled = isEnabled(newTrigger);
        if (enabled) {
            setTimeout(() => el.scrollIntoView(binding.value?.options));
        }
    },
};

function isEnabled(trigger: boolean | number | undefined): boolean {
    return trigger === undefined || !!trigger;
}
