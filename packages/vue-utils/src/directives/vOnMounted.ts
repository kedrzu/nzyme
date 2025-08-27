import type { ObjectDirective } from 'vue';

import type { ElementOrVue } from '../types.js';

/**
 * Vue directive that calls a function when the element is mounted.
 * Works with both DOM elements and Vue component instances.
 *
 * @example
 * ```vue
 * <template>
 *   <div v-on-mounted="handleMounted"></div>
 *   <MyComponent v-on-mounted="handleMounted" />
 * </template>
 * ```
 */
export const vOnMounted: ObjectDirective<ElementOrVue, (el: ElementOrVue) => void> = {
    mounted(el, binding) {
        binding.value(el);
    },
};
