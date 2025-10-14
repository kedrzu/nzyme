import type { ObjectDirective } from 'vue';

import type { ElementOrVue } from '../types.js';
import { unwrapElement } from '../unwrapElement.js';

/**
 * Vue directive that attaches native click event handlers to elements.
 * Works with both DOM elements and Vue component instances.
 *
 * @example
 * ```vue
 * <template>
 *   <div v-on-click="handleClick">Click me</div>
 *   <div v-on-click.capture="handleClick">Click me (capture phase)</div>
 *   <MyComponent v-on-click="handleClick" />
 * </template>
 * ```
 */
export const vOnClick: ObjectDirective<ElementOrVue, EventListener, 'capture'> = {
    mounted(el, binding) {
        const element = unwrapElement(el);
        if (element && binding.value) {
            const options = { capture: binding.modifiers.capture };
            element.addEventListener('click', binding.value, options);
        }
    },

    updated(el, binding) {
        const element = unwrapElement(el);
        if (!element) {
            return;
        }

        // Remove old listener if it exists
        if (binding.oldValue) {
            const oldOptions = { capture: binding.modifiers.capture };
            element.removeEventListener('click', binding.oldValue, oldOptions);
        }

        // Add new listener if it exists
        if (binding.value) {
            const options = { capture: binding.modifiers.capture };
            element.addEventListener('click', binding.value, options);
        }
    },

    unmounted(el, binding) {
        const element = unwrapElement(el);
        if (element && binding.value) {
            const options = { capture: binding.modifiers.capture };
            element.removeEventListener('click', binding.value, options);
        }
    },
};
