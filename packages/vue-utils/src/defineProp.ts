import type { PropType } from 'vue';

type PropOptions<T = unknown, D = T> = {
    type?: PropType<T> | true | null;
    required?: boolean;
    default?: D | (() => D) | null | undefined | object;
    validator?(value: unknown): boolean;
};

type PropOptionsRequired<T> = PropOptions<T> & { required: true };
type PropOptionsOptional<T> = PropOptions<T | null> & { required?: false };

/*#__NO_SIDE_EFFECTS__*/
export function defineProp<T>(): PropOptionsOptional<T | null>;
export function defineProp(type: DateConstructor): PropOptionsOptional<Date | null>;
export function defineProp(type: BooleanConstructor): PropOptionsOptional<boolean | null>;
export function defineProp(type: StringConstructor): PropOptionsOptional<string | null>;
export function defineProp(type: NumberConstructor): PropOptionsOptional<number | null>;
export function defineProp(type: BigIntConstructor): PropOptionsOptional<bigint | null>;
/*#__NO_SIDE_EFFECTS__*/
export function defineProp<T>(opts: PropOptionsRequired<T>): PropOptionsRequired<T>;
/*#__NO_SIDE_EFFECTS__*/
export function defineProp<T>(opts: PropOptionsOptional<T>): PropOptionsOptional<T>;
/*#__NO_SIDE_EFFECTS__*/
export function defineProp<T>(optsOrType?: unknown): PropOptions<T> {
    return (optsOrType || {}) as PropOptions<T>;
}
