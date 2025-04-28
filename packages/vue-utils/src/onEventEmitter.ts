import { onScopeDispose } from 'vue';

import type { EventEmitterCallback, EventEmitterEvents, EventEmitterPublic } from '@nzyme/utils';

export function onEventEmitter<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TEmitter extends EventEmitterPublic<any>,
    TEvent extends keyof EventEmitterEvents<TEmitter>,
>(
    emitter: TEmitter,
    event: TEvent,
    callback: EventEmitterCallback<EventEmitterEvents<TEmitter>, TEvent>,
) {
    emitter.on(event, callback);
    onScopeDispose(() => emitter.off(event, callback));
}
