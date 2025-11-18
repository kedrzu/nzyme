import type { ObjectDirective } from 'vue';

import type { ElementOrVue } from '../types.js';
import { unwrapElement } from '../unwrapElement.js';

/**
 * Configuration options for the v-scroll-into-view directive.
 */
export type ScrollIntoViewDirectiveOptions = {
    /** Native scroll options passed to Element.scrollIntoView() */
    options?: globalThis.ScrollIntoViewOptions;
    /** Whether to trigger scrolling. If number, treated as truthy/falsy. Defaults to true if undefined. */
    trigger?: boolean | number;
};

/**
 * Vue directive that scrolls an element into view when mounted or when the trigger value changes.
 * Provides a declarative way to handle scrolling to specific elements.
 *
 * @example
 * ```vue
 * <template>
 *   <!-- Auto-scroll when mounted -->
 *   <div v-scroll-into-view></div>
 *
 *   <!-- Conditional scrolling -->
 *   <div v-scroll-into-view="{ trigger: shouldScroll }"></div>
 *
 *   <!-- With scroll options -->
 *   <div v-scroll-into-view="{
 *     trigger: shouldScroll,
 *     options: { behavior: 'smooth', block: 'center' }
 *   }"></div>
 * </template>
 *
 * <script setup>
 * import { ref } from 'vue';
 *
 * const shouldScroll = ref(false);
 *
 * function scrollToElement() {
 *   shouldScroll.value = true;
 * }
 * </script>
 * ```
 */
export const vScrollIntoView: ObjectDirective<ElementOrVue, ScrollIntoViewDirectiveOptions | null | undefined> = {
    mounted(instance, binding) {
        const el = unwrapElement(instance);

        const enabled = isEnabled(binding.value?.trigger);
        if (el && enabled && el instanceof HTMLElement) {
            setTimeout(() => el.scrollIntoView(binding.value?.options));
        }
    },
    updated(instance, binding) {
        const el = unwrapElement(instance);
        const oldTrigger = binding.oldValue?.trigger;
        const newTrigger = binding.value?.trigger;

        if (oldTrigger === newTrigger) {
            return;
        }

        const enabled = isEnabled(newTrigger);
        if (el && enabled && el instanceof HTMLElement) {
            setTimeout(() => el.scrollIntoView(binding.value?.options));
        }
    },
};

function isEnabled(trigger: boolean | number | undefined): boolean {
    return trigger === undefined || !!trigger;
}
