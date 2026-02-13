import type { ExtractPropTypes } from 'vue';

import { useInstance } from './useInstance.js';

/**
 * Composable that provides access to the props of the current component instance.
 * Returns props without type constraints when no prop definition is provided.
 *
 * @template P - The props object type
 * @returns The props object from the current component instance
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useProps } from '@nzyme/vue-utils/useProps.js';
 *
 * // Generic props access
 * const props = useProps();
 * console.log(props.someGenericProp);
 * </script>
 * ```
 */
export function useProps<P extends object = Record<string, unknown>>(): P;
/**
 * Composable that provides access to strongly-typed props based on a prop definition.
 * Returns props with extracted types from the provided prop definition.
 *
 * @template P - The props definition type
 * @param propsDef - The props definition object for type inference
 * @returns Strongly-typed props object
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useProps } from '@nzyme/vue-utils/useProps.js';
 *
 * const propsDef = {
 *   title: { type: String, required: true },
 *   count: { type: Number, default: 0 }
 * };
 *
 * const props = useProps(propsDef);
 * // props.title is string, props.count is number
 * </script>
 * ```
 */
export function useProps<P>(propsDef: P): ExtractPropTypes<P>;
export function useProps() {
    return useInstance().props;
}
