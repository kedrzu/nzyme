import { arrayRemove } from './array/arrayRemove.js';

/**
 * Type representing a callback function for a single event.
 * @template TEvent - The type of the event data
 */
export type EventCallback<TEvent = void> = TEvent extends void
    ? () => Promise<void> | void
    : (event: TEvent) => Promise<void> | void;

/**
 * Interface for a single event emitter.
 * This is a simplified version of {@link EventEmitter} that only handles one type of event.
 * @template TEvent - The type of the event data
 */
export type EventEmitterSingle<TEvent = void> = {
    /**
     * Emits the event with optional data.
     * @param event - The event data to emit
     */
    emit(this: void, event: TEvent): void;
    /**
     * Emits the event with optional data and waits for all callbacks to complete.
     * @param event - The event data to emit
     * @returns A promise that resolves when all callbacks complete
     */
    emitAsync(this: void, event: TEvent): Promise<void>;
    /**
     * Removes a callback for the event.
     * @param callback - The function to remove
     */
    off(this: void, callback: EventCallback<TEvent>): void;
    /**
     * Registers a callback for the event.
     * @param callback - The function to call when the event occurs
     */
    on(this: void, callback: EventCallback<TEvent>): void;
};

/**
 * Creates a new single event emitter instance.
 * This is useful when you only need to emit one type of event.
 *
 * @template TEvent - The type of the event data
 * @returns A new single event emitter instance
 *
 * @example
 * ```typescript
 * const emitter = createSingleEventEmitter<string>();
 *
 * emitter.on(text => console.log(`Received: ${text}`));
 * emitter.emit('Hello!'); // Logs: "Received: Hello!"
 *
 * // Async example
 * const asyncEmitter = createSingleEventEmitter<number>();
 *
 * asyncEmitter.on(async n => {
 *     await waitFor(1000);
 *     console.log(n * 2);
 * });
 *
 * await asyncEmitter.emitAsync(5); // Logs: 10 after 1 second
 * ```
 */
export function createSingleEventEmitter<TEvent = void>(): EventEmitterSingle<TEvent> {
    type Callback = EventCallback<TEvent>;
    const listeners: Callback[] = [];

    return {
        on,
        off,
        emit,
        emitAsync,
    };

    function on(callback: Callback): void {
        listeners.push(callback);
    }

    function off(callback: Callback) {
        arrayRemove(listeners, callback);
    }

    function emit(event: TEvent): void {
        for (const callback of listeners) {
            void callback(event);
        }
    }

    async function emitAsync(event: TEvent): Promise<void> {
        for (const callback of listeners) {
            await callback(event);
        }
    }
}
