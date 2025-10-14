import type { SlotsType, VNode } from 'vue';

import type { SomeObject } from '@nzyme/types';

export type Slots<T> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [K in keyof T]?: (props: undefined extends T[K] ? SomeObject : T[K]) => VNode[];
};

/** Allows to define slots in @see defineComponent function. */
/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlots<T>() {
    return undefined as unknown as SlotsType<Slots<T>>;
}
