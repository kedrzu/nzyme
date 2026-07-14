import { arrayRemove } from './array/arrayRemove.js';

/**
 * Type representing a callback function for a single event.
 * @template P - The type of the event data
 */
export type EventCallback<E = unknown[]> = EventFunction<EventParams<E>>;

/**
 * Type representing a function that emits an event.
 * @template TEvent - The type of the event data
 */
export type EventEmit<E = unknown[]> = EventFunction<EventParams<E>, void>;

/**
 * Type representing a function that emits an event asynchronously.
 * @template TEvent - The type of the event data
 */
export type EventEmitAsync<E = unknown[]> = EventFunction<EventParams<E>, Promise<void>>;

/**
 * Type representing a function that subscribes to an event.
 */
export type EventEmitterOn<E = unknown[]> = (callback: EventCallback<E>) => void;

/**
 * Type representing a function that unsubscribes from an event.
 */
export type EventEmitterOff<E = unknown[]> = (callback: EventCallback<E>) => void;

/**
 * Interface for an event emitter that allows subscribing and unsubscribing from events.
 * @template TEvent - The type of the event data
 */
export interface EventEmitter<E = unknown[]> {
    /**
     * Subscribe to events by adding a callback function.
     * @param callback - The function to call when an event is emitted
     */
    on: EventEmitterOn<E>;
    /**
     * Unsubscribe from events by removing a previously added callback function.
     * @param callback - The callback function to remove
     */
    off: EventEmitterOff<E>;
}

/**
 * Type representing any event emitter, regardless of its event type.
 * @template TEvent - The type of the event data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventEmitterAny = EventEmitter<any>;

/**
 * Helper type to extract the parameters of an event.
 */
export type EventParams<E> = E extends unknown[] ? E : [event: E];

type EventFunction<P extends unknown[], R = unknown> = (...args: P) => R;

/**
 * Creates a new event emitter instance with emit functionality.
 * @util
 * @template TEvent - The type of event data that will be emitted (defaults to void)
 * @returns An object containing the event emitter and emit functions
 * @example
 * ```typescript
 * const { event, emit, emitAsync } = createEventEmitter<string>();
 *
 * event.on((message) => console.log(message));
 * emit('Hello World'); // Logs: Hello World
 * await emitAsync('Async Hello'); // Logs: Async Hello
 * ```
 */
export function createEventEmitter<E = []>() {
    const listeners: EventCallback<E>[] = [];

    const event: EventEmitter<E> = {
        on: callback => {
            listeners.push(callback);
        },
        off: callback => {
            arrayRemove(listeners, callback);
        },
    };

    const emit = ((...args: EventParams<E>) => {
        for (const callback of listeners) {
            void callback(...args);
        }
    }) satisfies EventEmit<E>;

    const emitAsync = async (...args: EventParams<E>) => {
        for (const callback of listeners) {
            await callback(...args);
        }
    };

    return {
        event,
        emit: emit as EventEmit<E>,
        emitAsync: emitAsync as EventEmitAsync<E>,
    };
}
