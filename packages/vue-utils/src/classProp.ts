import type { ClassValue, PropType } from 'vue';

/**
 * Represents a Vue.js class prop value that can be:
 * - A single class type (string, object, etc.)
 * - An array of class types
 * - An object with boolean values for conditional classes
 */
export type ClassProp = Array<ClassValue> | ClassValue | Record<string, boolean>;

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
// oxlint-disable-next-line nzyme/no-module-state -- Vue's `PropType` admits only a mutable array of constructors, so this list cannot be typed readonly; nothing writes it.
export const classProp = [String, Object, Array] as PropType<Array<ClassValue> | ClassValue>;
