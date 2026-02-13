import { onBeforeUnmount } from 'vue';

import { onHistoryBack } from '@nzyme/dom-utils/virtualHistory.js';
import type { VirtualHistoryCallback, VirtualHistoryHandle } from '@nzyme/dom-utils/virtualHistory.js';

/**
 *
 */
export function useVirtualHistory() {
    const handles: VirtualHistoryHandle[] = [];

    onBeforeUnmount(() => {
        for (const handle of handles) {
            handle.cancel();
        }
    });

    return {
        pushState(callback: VirtualHistoryCallback) {
            const handle = onHistoryBack(callback);
            handles.push(handle);
            return handle;
        },
    };
}
