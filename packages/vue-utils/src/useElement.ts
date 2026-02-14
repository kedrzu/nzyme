import { computed, getCurrentInstance } from 'vue';
import type { Ref } from 'vue';

/**
 * Composable that provides access to the root element of the current component.
 * Returns a readonly computed reference to the component's $el property.
 *
 * @template T - The expected element type (defaults to Element)
 * @returns A readonly ref containing the component's root element or undefined
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useElement } from '@nzyme/vue-utils/useElement.js';
 *
 * // Generic element
 * const el = useElement();
 *
 * // Specific element type
 * const buttonEl = useElement<HTMLButtonElement>();
 *
 * watchEffect(() => {
 *   if (buttonEl.value) {
 *     buttonEl.value.focus();
 *   }
 * });
 * </script>
 * ```
 */
export function useElement<T extends Element>(): Readonly<Ref<T | undefined>> {
    const vm = getCurrentInstance()?.proxy;

    return computed(() => vm?.$el as T | undefined) as Readonly<Ref<T | undefined>>;
}
