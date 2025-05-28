import type { PropType } from 'vue';

/**
 *
 */
export type ClassType = boolean | number | object | string | null | undefined;

/**
 *
 */
export type ClassProp = Array<ClassType> | ClassType | Record<string, boolean>;

/**
 *
 */
export const classProp = [String, Object, Array] as PropType<Array<ClassProp>>;
