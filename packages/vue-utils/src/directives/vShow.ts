import type { ObjectDirective } from 'vue';

// TODO remove when https://github.com/vuejs/core/pull/8371 is released

interface VShowElement extends HTMLElement {
    // _vod = vue original display
    _vod: string;
}

/**
 * Show directive.
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
