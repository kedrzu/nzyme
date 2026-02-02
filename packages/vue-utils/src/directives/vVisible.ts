import type { ObjectDirective } from 'vue';

// TODO remove when https://github.com/vuejs/core/pull/8371 is released

interface VVisibleElement extends HTMLElement {
    // _vov = vue original visibility
    _vov: string;
}

/**
 * Vue directive that conditionally shows/hides elements by toggling their visibility style.
 * Similar to v-show but uses CSS visibility instead of display, maintaining element layout space.
 *
 * Unlike v-show which removes elements from layout (display: none), v-visible keeps
 * the element's space in the layout while making it invisible (visibility: hidden).
 * Supports Vue transitions for smooth show/hide animations.
 *
 * @example
 * ```vue
 * <template>
 *   <!-- Element keeps its space even when hidden -->
 *   <div v-visible="isVisible">Content that can be hidden</div>
 *
 *   <!-- With transition -->
 *   <transition name="fade">
 *     <div v-visible="isVisible">Content with transition</div>
 *   </transition>
 *
 *   <!-- Compare with v-show -->
 *   <div v-show="isVisible">Removes from layout when hidden</div>
 *   <div v-visible="isVisible">Keeps layout space when hidden</div>
 * </template>
 *
 * <script setup lang="ts">
 * import { ref } from 'vue';
 *
 * const isVisible = ref(true);
 * </script>
 * ```
 */
export const vVisible: ObjectDirective<VVisibleElement> = {
    beforeMount(el, { value }, { transition }) {
        el._vov = el.style.visibility === 'hidden' ? '' : el.style.visibility;
        if (transition && value) {
            transition.beforeEnter(el);
        }
        setVisibility(el, value);
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
                const display = el.style.display;
                el.style.display = 'none';
                // force reflow
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                window.getComputedStyle(el).display;
                transition.beforeEnter(el);
                el.style.display = display;
                setVisibility(el, true);

                transition.enter(el);
            } else {
                transition.leave(el, () => {
                    setVisibility(el, false);
                });
            }
        } else {
            setVisibility(el, value);
        }
    },
    beforeUnmount(el, { value }) {
        setVisibility(el, value);
    },
    getSSRProps({ value }) {
        if (!value) {
            return { style: { visibility: 'hidden' } };
        }
    },
};

function setVisibility(el: VVisibleElement, value: unknown): void {
    el.style.visibility = value ? el._vov : 'hidden';
}
