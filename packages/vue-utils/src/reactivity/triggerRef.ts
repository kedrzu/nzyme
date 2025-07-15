import { nextTick, ref, watch } from 'vue';

/**
 * Returns a ref that can be used to trigger true for a short time.
 */
export function triggerRef() {
    const trigger = ref(false);

    watch(trigger, value => {
        if (value) {
            void nextTick(() => (trigger.value = false));
        }
    });

    return trigger;
}
