import { camelize, getCurrentInstance, toHandlerKey } from 'vue';

/**
 *
 */
type CamelizeString<S extends string> = S extends `${infer T}-${infer U}`
    ? `${T}${CamelizeString<Capitalize<U>>}`
    : S;

export type EmitAsProps<E extends object = Record<string, (...args: unknown[]) => unknown>> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [K in keyof E as K extends string ? `on${Capitalize<CamelizeString<K>>}` : never]: E[K] extends (
        ...args: any[]
    ) => unknown
        ? (...args: Parameters<E[K]>) => void
        : never;
};

/**
 * Composable that returns an object with the component's emits as props.
 * This is useful for forwarding the component's emits to the child component.
 *
 * @returns An object with the component's emits as props
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useEmitAsProps } from '@nzyme/vue-utils/useEmitAsProps.js';
 *
 * const emitsAsProps = useEmitAsProps();
 *
 * <ChildComponent v-bind="emitsAsProps" />
 * </script>
 * ```
 */
export function useEmitAsProps<E extends object = Record<string, (...args: unknown[]) => unknown>>(): EmitAsProps<E> {
    const vm = getCurrentInstance();
    let events = vm?.type.emits;

    const result: Record<string, unknown> = {};

    if (!events) {
        console.warn(`No emitted event found. Please check component: ${vm?.type.__name}`);
        return result as EmitAsProps<E>;
    }

    if (!Array.isArray(events)) {
        events = Object.keys(events);
    }

    for (const event of events) {
        if (typeof event !== 'string') {
            console.warn(`Event ${event} is not a string. Please check component: ${vm?.type.__name}`);
            continue;
        }

        result[toHandlerKey(camelize(event))] = (...args: unknown[]) => vm?.emit(event, ...args);
    }

    return result as EmitAsProps<E>;
}
