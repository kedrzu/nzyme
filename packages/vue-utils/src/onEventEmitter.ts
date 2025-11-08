import type { Ref } from 'vue';
import { isRef, onScopeDispose, toValue, watch } from 'vue';

import type { EventCallback, EventEmitter } from '@nzyme/utils';

type EventEmitterParam<TEvent> = EventEmitter<TEvent> | null | undefined;

/**
 *
 */
export function onEventEmitter<TEvent>(
    emitter: (() => EventEmitterParam<TEvent>) | EventEmitter<TEvent> | Readonly<Ref<EventEmitterParam<TEvent>>>,
    callback: EventCallback<TEvent>,
) {
    if (isRef(emitter) || typeof emitter === 'function') {
        // Emitter is wrapped in ref or getter
        watch(
            emitter,
            (newEmitter, oldEmitter) => {
                oldEmitter?.off(callback);
                newEmitter?.on(callback);
            },
            { immediate: true },
        );
    } else {
        // Raw emitter object
        emitter.on(callback);
    }

    onScopeDispose(() => toValue(emitter)?.off(callback));
}
