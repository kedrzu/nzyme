import type { IfLiteral, IfUnknown, NonVoidPropKeys, VoidPropKeys } from '@nzyme/types';

import { arrayRemove } from './array/arrayRemove.js';

/**
 * Complete interface of an event emitter including internal methods.
 * @template TEvents - The type of all possible events
 */
export interface EventEmitter<TEvents> extends EventEmitterPublic<TEvents> {
    /**
     * Emits an event with no payload.
     * @param event - The event to emit
     */
    emit<E extends keyof TEvents & VoidPropKeys<PredefinedEvents<TEvents>>>(this: void, event: E): void;
    /**
     * Emits an event with a payload.
     * @param event - The event to emit
     * @param value - The payload to send with the event
     */
    emit<E extends keyof TEvents & NonVoidPropKeys<PredefinedEvents<TEvents>>>(
        this: void,
        event: E,
        value: TEvents[E],
    ): void;
    /**
     *
     */
    emit<E extends keyof TEvents & VoidPropKeys<GenericEvents<TEvents>>>(event: E): void;
    /**
     *
     */
    emit<E extends keyof TEvents & NonVoidPropKeys<GenericEvents<TEvents>>>(
        this: void,
        event: E,
        value: TEvents[E],
    ): void;

    /**
     * Emits an event with no payload and waits for all callbacks to complete.
     * @param event - The event to emit
     * @returns A promise that resolves when all callbacks complete
     */
    emitAsync<E extends keyof TEvents & VoidPropKeys<PredefinedEvents<TEvents>>>(this: void, event: E): Promise<void>;
    /**
     * Emits an event with a payload and waits for all callbacks to complete.
     * @param event - The event to emit
     * @param value - The payload to send with the event
     * @returns A promise that resolves when all callbacks complete
     */
    emitAsync<E extends keyof TEvents & NonVoidPropKeys<PredefinedEvents<TEvents>>>(
        this: void,
        event: E,
        value: TEvents[E],
    ): Promise<void>;
    /**
     *
     */
    emitAsync<E extends keyof TEvents & VoidPropKeys<GenericEvents<TEvents>>>(this: void, event: E): void;
    /**
     *
     */
    emitAsync<E extends keyof TEvents & NonVoidPropKeys<GenericEvents<TEvents>>>(
        this: void,
        event: E,
        value: TEvents[E],
    ): Promise<void>;

    /**
     *
     */
    public: EventEmitterPublic<TEvents>;
}

/**
 * Type representing a callback function for an event.
 * @template TEvents - The type of all possible events
 * @template E - The specific event type
 */
export type EventEmitterCallback<TEvents, E extends keyof TEvents> = TEvents[E] extends void
    ? () => Promise<unknown> | void
    : (event: TEvents[E]) => Promise<unknown> | void;

/**
 * Extracts the events type from an event emitter.
 * @template TEmitter - The type of the event emitter
 */
export type EventEmitterEvents<TEmitter> =
    | (TEmitter extends EventEmitter<infer TEvents> ? IfUnknown<TEvents, never> : never)
    | (TEmitter extends EventEmitterPublic<infer TEvents> ? IfUnknown<TEvents, never> : never);

/**
 * Public interface of an event emitter that can be used by consumers.
 * @template TEvents - The type of all possible events
 */
export type EventEmitterPublic<TEvents> = {
    /**
     * Removes a callback for a specific event.
     * @param event - The event to stop listening for
     * @param callback - The function to remove
     */
    off<E extends keyof PredefinedEvents<TEvents>>(
        this: void,
        event: E,
        callback: EventEmitterCallback<TEvents, E>,
    ): void;
    /**
     *
     */
    off<E extends keyof GenericEvents<TEvents>>(this: void, event: E, callback: EventEmitterCallback<TEvents, E>): void;
    /**
     *
     */
    off<E extends keyof TEvents>(this: void, event: E, callback: EventEmitterCallback<TEvents, E>): void;

    /**
     * Registers a callback for a specific event.
     * @param event - The event to listen for
     * @param callback - The function to call when the event occurs
     */
    on<E extends keyof PredefinedEvents<TEvents>>(
        this: void,
        event: E,
        callback: EventEmitterCallback<TEvents, E>,
    ): void;
    /**
     *
     */
    on<E extends keyof GenericEvents<TEvents>>(this: void, event: E, callback: EventEmitterCallback<TEvents, E>): void;
    /**
     *
     */
    on<E extends keyof TEvents>(this: void, event: E, callback: EventEmitterCallback<TEvents, E>): void;
};

/**
 * Type representing generic events in an event emitter.
 * @template TEvents - The type of all possible events
 * @private
 */
type GenericEvents<TEvents> = {
    [E in keyof TEvents as IfLiteral<E, never, E>]: TEvents[E];
};

/**
 * Type representing predefined events in an event emitter.
 * @template TEvents - The type of all possible events
 * @private
 */
type PredefinedEvents<TEvents> = {
    [E in keyof TEvents as IfLiteral<E, E, never>]: TEvents[E];
};

/**
 * Creates a new event emitter instance.
 *
 * @template TEvents - The type of all possible events
 * @returns A new event emitter instance
 *
 * @example
 * ```typescript
 * type Events = {
 *     'user:created': { id: string; name: string };
 *     'user:deleted': void;
 * };
 *
 * const emitter = createEventEmitter<Events>();
 *
 * emitter.on('user:created', user => {
 *     console.log(`User created: ${user.name}`);
 * });
 *
 * emitter.on('user:deleted', () => {
 *     console.log('User deleted');
 * });
 *
 * emitter.emit('user:created', { id: '1', name: 'John' });
 * emitter.emit('user:deleted');
 * ```
 */
export function createEventEmitter<TEvents>(): EventEmitter<TEvents> {
    type Callback = EventEmitterCallback<TEvents, keyof TEvents>;
    const listeners = new Map<keyof TEvents, Callback[]>();

    return {
        on,
        off,
        emit,
        emitAsync,
        public: {
            on,
            off,
        },
    };

    function on<E extends keyof TEvents>(event: E, callback: EventEmitterCallback<TEvents, E>) {
        let callbacks = listeners.get(event);
        if (!callbacks) {
            callbacks = [];
            listeners.set(event, callbacks);
        }

        callbacks.push(callback as Callback);
    }

    function off<E extends keyof TEvents>(event: E, callback: EventEmitterCallback<TEvents, E>) {
        const callbacks = listeners.get(event);
        if (callbacks) {
            arrayRemove(callbacks, callback as Callback);
        }
    }

    function emit<E extends keyof TEvents>(event: E, value?: TEvents[E]): void {
        const callbacks = listeners.get(event);
        if (!callbacks) {
            return;
        }

        for (const callback of callbacks) {
            void callback(value as TEvents[E]);
        }
    }

    async function emitAsync<E extends keyof TEvents>(event: E, value?: TEvents[E]): Promise<void> {
        const callbacks = listeners.get(event);
        if (!callbacks) {
            return;
        }

        for (const callback of callbacks) {
            await callback(value as TEvents[E]);
        }
    }
}
