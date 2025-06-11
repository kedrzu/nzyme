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
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(): PropOptionsOptional<T | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: DateConstructor): PropOptionsOptional<Date | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: BooleanConstructor): PropOptionsOptional<boolean | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: StringConstructor): PropOptionsOptional<string | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: NumberConstructor): PropOptionsOptional<number | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp(type: BigIntConstructor): PropOptionsOptional<bigint | null>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(opts: PropOptionsRequired<T>): PropOptionsRequired<T>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(opts: PropOptionsOptional<T>): PropOptionsOptional<T>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineProp<T>(optsOrType?: unknown): PropOptions<T> {
    return (optsOrType || {}) as PropOptions<T>;
}
