import { onBeforeUnmount } from 'vue';

import { type VirtualHistoryHandle, onHistoryBack } from '@nzyme/dom-utils';

type Callback = () => void;

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
        pushState(callback: Callback) {
            const handle = onHistoryBack(callback);
            handles.push(handle);
            return handle;
        },
    };
}
