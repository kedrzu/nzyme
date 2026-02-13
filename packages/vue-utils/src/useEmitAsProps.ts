import { camelize, getCurrentInstance, toHandlerKey } from 'vue';

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
export function useEmitAsProps() {
    const vm = getCurrentInstance();
    let events = vm?.type.emits;

    const result: Record<string, (...args: unknown[]) => void> = {};

    if (!events) {
        console.warn(`No emitted event found. Please check component: ${vm?.type.__name}`);
        return result;
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

    return result;
}
