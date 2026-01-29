import type { ObjectDirective } from 'vue';

// TODO remove when https://github.com/vuejs/core/pull/8371 is released

interface VShowElement extends HTMLElement {
    // _vod = vue original display
    _vod: string;
}

/**
 * Vue directive implementation that conditionally shows/hides elements by toggling their display style.
 * This is a custom implementation of Vue's built-in v-show directive with transition support.
 *
 * Preserves the original display value and restores it when showing the element.
 * Supports Vue transitions for smooth show/hide animations.
 *
 * @example
 * ```vue
 * <template>
 *   <div v-show="isVisible">Content that can be hidden</div>
 *
 *   <transition name="fade">
 *     <div v-show="isVisible">Content with transition</div>
 *   </transition>
 * </template>
 *
 * <script setup lang="ts">
 * import { ref } from 'vue';
 *
 * const isVisible = ref(true);
 * </script>
 * ```
 */
export const vShow: ObjectDirective<VShowElement> = {
    beforeMount(el, { value }, { transition }) {
        el._vod = el.style.display === 'none' ? '' : el.style.display;
        if (transition && value) {
            transition.beforeEnter(el);
        }
        setDisplay(el, value);
    },
    mounted(el, { value }, { transition }) {
        if (transition && value) {
            transition.enter(el);
        }
    },
    updated(el, { value, oldValue }, { transition }) {
        if (!value === !oldValue) {
            return;
        }
        if (transition) {
            if (value) {
                transition.beforeEnter(el);
                setDisplay(el, true);
                transition.enter(el);
            } else {
                transition.leave(el, () => {
                    setDisplay(el, false);
                });
            }
        } else {
            setDisplay(el, value);
        }
    },
    beforeUnmount(el, { value }) {
        setDisplay(el, value);
    },
    getSSRProps({ value }) {
        if (!value) {
            return { style: { display: 'none' } };
        }
    },
};

function setDisplay(el: VShowElement, value: unknown): void {
    el.style.display = value ? el._vod : 'none';
}
