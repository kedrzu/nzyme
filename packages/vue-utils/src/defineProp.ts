import type { PropType } from 'vue';

type PropOptions<T = unknown, D = T> = {
    default?: (() => D) | object | D | null | undefined;
    required?: boolean;
    type?: PropType<T> | true | null;
    validator?(value: unknown): boolean;
};

type PropOptionsRequired<T> = PropOptions<T> & { required: true };
type PropOptionsOptional<T> = PropOptions<T | null> & { required?: false };

/**
 * Defines an optional prop without specifying a type constructor.
 *
 * @template T - The prop value type
 * @returns Prop options for an optional prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   customData: defineProp<UserData>()
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(): PropOptionsOptional<T | null>;
/**
 * Defines an optional Date prop.
 *
 * @param type - Date constructor
 * @returns Prop options for an optional Date prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   createdAt: defineProp(Date)
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: DateConstructor): PropOptionsOptional<Date | null>;
/**
 * Defines an optional boolean prop.
 *
 * @param type - Boolean constructor
 * @returns Prop options for an optional boolean prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   isVisible: defineProp(Boolean)
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: BooleanConstructor): PropOptionsOptional<boolean | null>;
/**
 * Defines an optional string prop.
 *
 * @param type - String constructor
 * @returns Prop options for an optional string prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   title: defineProp(String)
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: StringConstructor): PropOptionsOptional<string | null>;
/**
 * Defines an optional number prop.
 *
 * @param type - Number constructor
 * @returns Prop options for an optional number prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   count: defineProp(Number)
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: NumberConstructor): PropOptionsOptional<number | null>;
/**
 * Defines an optional bigint prop.
 *
 * @param type - BigInt constructor
 * @returns Prop options for an optional bigint prop
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   largeId: defineProp(BigInt)
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: BigIntConstructor): PropOptionsOptional<bigint | null>;
/**
 * Defines a required prop with custom options.
 *
 * @template T - The prop value type
 * @param opts - Prop options with required: true
 * @returns Required prop options
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   userId: defineProp({ type: String, required: true })
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(opts: PropOptionsRequired<T>): PropOptionsRequired<T>;
/**
 * Defines an optional prop with custom options.
 *
 * @template T - The prop value type
 * @param opts - Prop options with required: false or undefined
 * @returns Optional prop options
 *
 * @example
 * ```typescript
 * const props = defineProps({
 *   theme: defineProp({
 *     type: String,
 *     default: 'light',
 *     validator: (value) => ['light', 'dark'].includes(value)
 *   })
 * });
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(opts: PropOptionsOptional<T>): PropOptionsOptional<T>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(optsOrType?: unknown): PropOptions<T> {
    return optsOrType || {};
}
