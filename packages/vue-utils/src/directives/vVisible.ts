import type { ObjectDirective } from 'vue';

// TODO remove when https://github.com/vuejs/core/pull/8371 is released

interface VVisibleElement extends HTMLElement {
    // _vov = vue original visibility
    _vov: string;
}

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
