import { watch } from 'vue';
import type { WatchSource } from 'vue';

/**
 *
 */
export function onTrigger(trigger: WatchSource<boolean | null | undefined>, callback: () => unknown) {
    watch(trigger, value => {
        if (value) {
            callback();
        }
    });
}
