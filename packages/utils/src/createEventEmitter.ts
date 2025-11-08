import { arrayRemove } from './array/arrayRemove.js';

/**
 * Type representing a callback function for a single event.
 * @template TEvent - The type of the event data
 */
export type EventCallback<TEvent = unknown> = EventFunction<TEvent, unknown>;

/**
 * Type representing a function that emits an event.
 * @template TEvent - The type of the event data
 */
export type EventEmitSync<TEvent = unknown> = EventFunction<TEvent, void>;

/**
 * Type representing a function that emits an event asynchronously.
 * @template TEvent - The type of the event data
 */
export type EventEmitAsync<TEvent = unknown> = EventFunction<TEvent, Promise<void>>;

/**
 * Type representing a function that can emit events both synchronously and asynchronously.
 * @template TEvent - The type of the event data
 */
export type EventEmit<TEvent = unknown> = EventEmitSync<TEvent> & {
    /**
     * Asynchronous version of the emit function that waits for all listeners to complete.
     */
    async: EventEmitAsync<TEvent>;
};

/**
 * Interface for an event emitter that allows subscribing and unsubscribing from events.
 * @template TEvent - The type of the event data
 */
export interface EventEmitter<TEvent = unknown> {
    /**
     * Subscribe to events by adding a callback function.
     * @param callback - The function to call when an event is emitted
     */
    on: (callback: EventCallback<TEvent>) => void;
    /**
     * Unsubscribe from events by removing a previously added callback function.
     * @param callback - The callback function to remove
     */
    off: (callback: EventCallback<TEvent>) => void;
}

/**
 * Internal type helper for creating event functions with optional parameters when TEvent includes undefined.
 * @template TEvent - The type of the event data
 * @template TResult - The return type of the function
 */
type EventFunction<TEvent, TResult> = ((event: TEvent) => TResult) &
    (TEvent | undefined extends TEvent ? (event?: TEvent) => TResult : (event: TEvent) => TResult);

/**
 * Creates a new event emitter instance with emit functionality.
 * @template TEvent - The type of event data that will be emitted (defaults to void)
 * @returns An object containing the event emitter and emit functions
 * @example
 * ```typescript
 * const { event, emit } = createEventEmitter<string>();
 *
 * event.on((message) => console.log(message));
 * emit('Hello World'); // Logs: Hello World
 *
 * // Async emission
 * await emit.async('Async Hello');
 * ```
 */
export function createEventEmitter<TEvent = void>() {
    type Callback = EventCallback<TEvent>;
    const listeners: Callback[] = [];

    const event: EventEmitter<TEvent> = {
        on: (callback: EventCallback<TEvent>) => {
            listeners.push(callback);
        },
        off: (callback: EventCallback<TEvent>) => {
            arrayRemove(listeners, callback);
        },
    };

    const emit = ((event: TEvent) => {
        for (const callback of listeners) {
            void callback(event);
        }
    }) as EventEmit<TEvent>;

    emit.async = (async (event: TEvent) => {
        for (const callback of listeners) {
            await callback(event);
        }
    }) as EventEmitAsync<TEvent>;

    return {
        event,
        emit,
    };
}
