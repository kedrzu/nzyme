import { onScopeDispose } from 'vue';

import type { EventCallback, EventEmitter } from '@nzyme/utils';

/**
 *
 */
export function onEventEmitter<TEvent>(emitter: EventEmitter<TEvent>, callback: EventCallback<TEvent>) {
    emitter(callback);
    onScopeDispose(() => emitter.off(callback));
}
