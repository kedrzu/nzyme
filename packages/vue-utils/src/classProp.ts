import type { PropType } from 'vue';

/**
 * Represents the basic types that can be used as CSS class values.
 * Supports Vue.js class binding patterns including conditional classes.
 */
export type ClassType = boolean | number | object | string | null | undefined;

/**
 * Represents a Vue.js class prop value that can be:
 * - A single class type (string, object, etc.)
 * - An array of class types
 * - An object with boolean values for conditional classes
 */
export type ClassProp = Array<ClassType> | ClassType | Record<string, boolean>;

/**
 * Vue prop definition for class-based styling.
 * Accepts string, object, or array values compatible with Vue's class binding syntax.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const props = defineProps({
 *   class: classProp
 * })
 * </script>
 *
 * <!-- Usage -->
 * <MyComponent :class="'btn btn-primary'" />
 * <MyComponent :class="{ active: isActive }" />
 * <MyComponent :class="['btn', { 'btn-primary': isPrimary }]" />
 * ```
 */
export const classProp = [String, Object, Array] as PropType<Array<ClassProp> | ClassProp>;
