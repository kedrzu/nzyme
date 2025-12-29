import type { Ref } from 'vue';
import { isRef, onScopeDispose, toValue, watch } from 'vue';

import type { EventCallback, EventEmitter } from '@nzyme/utils';

type EventEmitterParam<E> = EventEmitter<E> | null | undefined;

/**
 *
 */
export function onEventEmitter<E>(
    emitter: (() => EventEmitterParam<E>) | EventEmitter<E> | Readonly<Ref<EventEmitterParam<E>>>,
    callback: EventCallback<E>,
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
