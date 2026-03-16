import type { SlotsType, VNode } from 'vue';

import type { SomeObject } from '@nzyme/types/Object.js';

/** Maps slot names to their render functions, converting slot prop types to VNode arrays. */
export type Slots<T> = {
    [K in keyof T]?: (props: undefined extends T[K] ? SomeObject : T[K]) => VNode[];
};

/** Allows to define slots in @see defineComponent function. */
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlots<T>() {
    return undefined as unknown as SlotsType<Slots<T>>;
}
