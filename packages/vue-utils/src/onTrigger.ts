import { watch } from 'vue';
import type { WatchSource } from 'vue';

/** Watches a boolean source and invokes the callback whenever it becomes truthy. */
export function onTrigger(trigger: WatchSource<boolean | null | undefined>, callback: () => unknown) {
    watch(trigger, value => {
        if (value) {
            callback();
        }
    });
}
