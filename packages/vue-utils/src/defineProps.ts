import type { ComponentObjectPropsOptions } from 'vue';

/**
 * Helper function to define component props with enhanced type safety.
 * This is a type-safe wrapper around Vue's props definition that preserves
 * the exact type information for better TypeScript inference.
 *
 * @template P - The props options type extending ComponentObjectPropsOptions
 * @param props - The props definition object
 * @returns The same props object with preserved typing
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   title: { type: String, required: true },
 *   count: { type: Number, default: 0 },
 *   isVisible: { type: Boolean, default: true }
 * });
 *
 * // props will have proper TypeScript types inferred
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProps<P extends ComponentObjectPropsOptions>(props: P) {
    return props;
}
