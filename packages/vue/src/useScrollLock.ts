import { getScrollBarWidth, isBrowser } from '@barebone/dom-utils';
import { onMounted, onUnmounted, watch } from 'vue';


import { type RefParam, makeRef } from './reactivity/makeRef.js';
import css from './useScrollLock.module.scss';

interface ScrollLockOptions {
    condition?: RefParam<boolean>;
}

// Because scroll lock can be called from multiple components,
// we need to track how many components are locking the scroll.
// Otherwise one component releasing the lock would release it for all.
let lockCount = 0;

/**
 * Locks body scroll on a given condition.
 * Can be used from multiple components.
 */
export function useScrollLock(options: ScrollLockOptions = {}) {
    if (!isBrowser()) {
        return;
    }

    const scrollbarWidth = `${getScrollBarWidth()}px`;
    // Stores info on whether scroll was locked by this element
    let lockLocal = false;

    onMounted(() => {
        if (options.condition) {
            watch(
                makeRef(options.condition),
                condition => (condition ? lockScroll() : unlockScroll()),
                { immediate: true },
            );
        } else {
            // no condition - add class immadietely
            lockScroll();
        }
    });

    onUnmounted(unlockScroll);

    function lockScroll() {
        if (lockLocal) {
            // Protect against incrementing the counter multiple times
            return;
        }

        lockLocal = true;
        lockCount++;

        document.body.classList.add(css.scrollLock);
        // When we disable body scroll padding is added to body
        // to ensure document content will not jump.
        // However, elements that have fixed position, ignores body paddings.
        // So we set a CSS4 variable on the root level, to be used inside styles.
        document.documentElement.style.setProperty('--body-padding-right', scrollbarWidth);
    }

    function unlockScroll() {
        if (!lockLocal) {
            // Protect against decrementing the counter multiple times
            return;
        }

        lockLocal = false;
        lockCount--;
        if (!lockCount) {
            document.body.classList.remove(css.scrollLock);
            document.documentElement.style.setProperty('--body-padding-right', null);
        }
    }
}
