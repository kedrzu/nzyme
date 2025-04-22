import { onScopeDispose } from 'vue';

import { createEventEmitter } from '@nzyme/utils';
import type { EventEmitterCallback } from '@nzyme/utils';

/**
 *
 */
export function useEventEmitter<TEvents extends object>() {
    const emitter = createEventEmitter<TEvents>();
    const emitterOn = emitter.on;

    emitter.on = on;

    return emitter;

    function on<E extends keyof TEvents>(event: E, callback: EventEmitterCallback<TEvents, E>) {
        emitterOn(event, callback);
        onScopeDispose(() => emitter.off(event, callback));
    }
}
