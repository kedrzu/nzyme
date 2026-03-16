import { watch } from 'vue';
import type { WatchSource } from 'vue';

import type { VirtualHistoryCallback, VirtualHistoryHandle } from '@nzyme/dom-utils/virtualHistory.js';

import { useVirtualHistory } from './useVirtualHistory.js';

/**
 * Options for the onHistoryBack function.
 */
export type OnHistoryBackOptions = {
    /**
     * The callback to call when the user presses the back button.
     */
    callback: VirtualHistoryCallback;
    /**
     * If true, the callback will be called when the user presses the back button.
     */
    enabled?: WatchSource<boolean>;
};

/** Registers a callback for virtual history back navigation, optionally gated by an enabled flag. */
export function onHistoryBack(options: OnHistoryBackOptions) {
    const virtualHistory = useVirtualHistory();

    let handle: VirtualHistoryHandle | undefined;

    if (options.enabled) {
        watch(options.enabled, enabled => {
            console.warn('[onHistoryBack] watch callback - enabled:', enabled);
            if (enabled) {
                init();
            } else {
                cancel();
            }
        });
    }

    return {
        init,
        cancel,
    };

    function init() {
        if (!handle) {
            handle = virtualHistory.pushState(options.callback);
        }
    }

    function cancel() {
        if (handle) {
            handle.cancel();
            handle = undefined;
        }
    }
}
