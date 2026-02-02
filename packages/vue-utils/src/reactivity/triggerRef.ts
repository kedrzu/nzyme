import { nextTick, ref, watch } from 'vue';

/**
 * Creates a reactive reference that automatically resets to false on the next tick after being set to true.
 * Useful for triggering one-time actions or animations that need to be reset immediately.
 *
 * The ref can be set to true to trigger an action, and it will automatically
 * become false again on the next Vue tick cycle.
 *
 * @returns A reactive ref that auto-resets from true to false
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { triggerRef } from '@nzyme/vue-utils';
 *
 * const shake = triggerRef();
 *
 * function triggerShake() {
 *   shake.value = true; // Will become false on next tick
 * }
 *
 * // Watch for trigger
 * watch(shake, (isShaking) => {
 *   if (isShaking) {
 *     console.log('Start shake animation');
 *     // Animation will start and shake.value will auto-reset to false
 *   }
 * });
 * </script>
 *
 * <template>
 *   <div :class="{ shake: shake }" @click="triggerShake">
 *     Click to shake
 *   </div>
 * </template>
 * ```
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
