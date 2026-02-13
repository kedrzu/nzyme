import { capitalize } from 'vue';
import type { EmitsOptions, ObjectEmitsOptions } from 'vue';

import type { RecordToUnion } from '@nzyme/types/Common.js';
import type { UnionToIntersection } from '@nzyme/types/Union.js';

import { useInstance } from './useInstance.js';

type ShortEmits<T extends object> = UnionToIntersection<
    RecordToUnion<{
        [K in keyof T]: T[K] extends unknown[]
            ? (evt: K, ...args: T[K]) => Promise<void>
            : (evt: K, event: T[K]) => Promise<void>;
    }>
>;

type EmitFnAsync<Options = ObjectEmitsOptions, Event extends keyof Options = keyof Options> =
    Options extends Array<infer V>
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: V, ...args: any[]) => void
        : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {} extends Options
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event: string, ...args: any[]) => void
          : UnionToIntersection<
                {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [key in Event]: Options[key] extends (...args: infer Args) => any
                        ? (event: key, ...args: Args) => Promise<void> | void
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (event: key, ...args: any[]) => Promise<void> | void;
                }[Event]
            >;
/**
 * Creates an async event emitter function that can handle both synchronous and asynchronous event listeners.
 * This composable allows you to emit events and wait for all listeners to complete, including async ones.
 *
 * @param options - Vue emit options defining the event types and their parameters
 * @returns An async emit function that returns a Promise when called
 *
 * @example
 * ```ts
 * // Define event types
 * type Events = {
 *   save: [data: { id: string; name: string }];
 *   delete: [id: string];
 *   update: [id: string, changes: object];
 * };
 *
 * // In your component setup
 * const emitAsync = useEmitAsync<Events>();
 *
 * // Emit events and wait for completion
 * async function handleSave() {
 *   const data = { id: '1', name: 'John' };
 *   await emitAsync('save', data);
 *   console.log('All save listeners completed');
 * }
 * ```
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useEmitAsync } from '@nzyme/vue-utils/useEmitAsync.js';
 *
 * type Events = {
 *   send: [message: string];
 *   close: [];
 * };
 *
 * defineEmits<Events>();
 * const emitAsync = useEmitAsync<Events>();
 *
 * async function handleSend() {
 *   if (message.value?.trim()) {
 *     // Wait for all send event listeners to complete
 *     await emitAsync('send', message.value);
 *     message.value = '';
 *   }
 * }
 * </script>
 *
 * <template>
 *   <button @click="handleSend">Send</button>
 * </template>
 * ```
 */
export function useEmitAsync<E extends EmitsOptions>(options: E): EmitFnAsync<E>;

/**
 * Creates an async event emitter function with type inference for event definitions.
 * This overload allows you to define events as an object type without explicit emit options.
 *
 * @returns An async emit function with type-safe event handling
 *
 * @example
 * ```ts
 * // Define events as object type
 * type Events = {
 *   userLogin: [userId: string, timestamp: Date];
 *   userLogout: [userId: string];
 *   dataSync: [syncId: string, progress: number];
 * };
 *
 * // Use without explicit options
 * const emitAsync = useEmitAsync<Events>();
 *
 * // Type-safe event emission
 * await emitAsync('userLogin', 'user123', new Date());
 * await emitAsync('dataSync', 'sync456', 0.75);
 * ```
 */
export function useEmitAsync<E extends object = Record<string, unknown[]>>(): ShortEmits<E>;

/**
 * Implementation of the async event emitter composable.
 *
 * This function creates an event emitter that:
 * - Handles both single and multiple event listeners
 * - Supports async listeners and waits for their completion
 * - Returns promises that resolve when all listeners complete
 * - Maintains type safety with Vue's emit system
 *
 * The emitter works by:
 * 1. Converting event names to Vue prop names (e.g., 'send' -> 'onSend')
 * 2. Finding listeners attached to the component's vnode props
 * 3. Calling all listeners and collecting their return values
 * 4. Using Promise.all() to wait for async listeners to complete
 *
 * @returns A function that emits events and returns a Promise
 *
 * @example
 * ```ts
 * // Real-world usage in a chat input component
 * type Events = {
 *   send: [message: string];
 * };
 *
 * const emitAsync = useEmitAsync<Events>();
 *
 * async function handleSend() {
 *   if (message.value?.trim()) {
 *     // This will wait for parent components to handle the send event
 *     // including any async operations like API calls
 *     await emitAsync('send', message.value);
 *
 *     // Only clear the message after all handlers complete
 *     message.value = '';
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * // Parent component handling the async event
 * async function handleMessageSend(message: string) {
 *   // This async operation will be awaited by the child component
 *   await api.sendMessage(message);
 *   await updateChatHistory();
 *   showSuccessNotification();
 * }
 * ```
 */
export function useEmitAsync() {
    const instance = useInstance();

    return (event: string, ...args: unknown[]) => {
        const attrName = 'on' + capitalize(event);

        /**
         * Type definition for event listener functions that can be attached to Vue components.
         * These listeners can return any value, including Promises for async operations.
         */
        type Listener = (...args: unknown[]) => unknown;
        const listeners = instance.vnode.props?.[attrName] as Listener | Listener[] | undefined;

        if (!listeners) {
            return;
        }

        if (Array.isArray(listeners)) {
            const promises: unknown[] = [];
            for (const listener of listeners) {
                if (typeof listener === 'function') {
                    promises.push(listener(...args));
                }
            }

            // there are many listeners for this event
            return Promise.all(promises);
        } else if (typeof listeners === 'function') {
            return listeners(...args);
        }
    };
}
