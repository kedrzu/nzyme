import { getCurrentInstance, onActivated, onBeforeUnmount, onDeactivated } from 'vue';

import { isBrowser } from '@nzyme/dom-utils';

type EventCallback<T = void> = (arg: T) => void | Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventHandlers = new Map<string, EventCallback<any>[]>();

interface EventBus {
    on<T = void>(event: string, fct: EventCallback<T>): void;
    emit(event: string): void;
    emit<T>(event: string, arg: T): void;
    emit<T>(event: string, arg?: T): void;
}

interface EventBusSingle<T> {
    on(fct: EventCallback<T>): void;
    emit<T>(arg: T): void;
}

interface EventBusVoid {
    on(fct: EventCallback<void>): void;
    emit(): void;
}

export function useEventBus(event: string): EventBusVoid;
export function useEventBus<T>(event: string): EventBusSingle<T>;
export function useEventBus(): EventBus;
export function useEventBus(event?: string): EventBus | EventBusVoid | EventBusSingle<unknown> {
    const vm = getCurrentInstance();

    if (!isBrowser()) {
        // On SSR using event bus causes memory leaks because of shared bus instance
        const bus: EventBus = {
            on() {
                // nothing here
            },
            emit() {
                // nothing here
            },
        };

        return bus;
    }

    if (event) {
        const bus: EventBusSingle<unknown> = {
            on(fct) {
                onEvent(event, fct, vm != null);
            },
            emit(arg) {
                emit(event, arg);
            },
        };

        return bus;
    } else {
        const bus: EventBus = {
            on<T = void>(event: string, fct: EventCallback<T>) {
                onEvent(event, fct, vm != null);
            },
            emit,
        };

        return bus;
    }
}

function onEvent<T>(event: string, fct: EventCallback<T>, useHooks: boolean) {
    on(event, fct);
    if (useHooks) {
        onDeactivated(() => off(event, fct));
        onActivated(() => on(event, fct));
        onBeforeUnmount(() => off(event, fct));
    }
}

function on<T = void>(event: string, fct: EventCallback<T>) {
    let handlers = eventHandlers.get(event);
    if (!handlers) {
        handlers = [];
        eventHandlers.set(event, handlers);
    }

    handlers.push(fct);
    return () => off(event, fct);
}

function off<T = void>(event: string, fct: EventCallback<T>) {
    const handlers = eventHandlers.get(event);
    if (!handlers) {
        return;
    }

    const index = handlers.indexOf(fct);
    if (index > -1) {
        handlers.splice(index, 1);
    }
}

function emit(event: string): void;
function emit<T>(event: string, arg: T): void;
function emit<T>(event: string, arg?: T): void {
    const handlers = eventHandlers.get(event);
    if (!handlers) {
        return;
    }

    for (const handler of handlers) {
        void handler(arg);
    }
}
