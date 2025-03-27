// Because scroll lock can be called from multiple components,
// we need to track how many components are locking the scroll.

import { getScrollBarWidth } from './getScrollBarWidth.js';

// Otherwise one component releasing the lock would release it for all.
let lockCount = 0;
let currentPaddingRight = '';
let currentOverflow = '';

/**
 * Locks the body scroll.
 * @returns A function that unlocks the scroll.
 */
export function lockBodyScroll() {
    if (lockCount === 0) {
        const scrollbarWidth = getScrollBarWidth();
        currentPaddingRight = document.body.style.paddingRight;
        currentOverflow = document.body.style.overflow;

        const computedPaddingRight = parseFloat(getComputedStyle(document.body).paddingRight);

        document.body.style.overflow = 'hidden';
        // When we disable body scroll padding is added to body
        // to ensure document content will not jump.
        // However, elements that have fixed position, ignores body paddings.
        // So we set a CSS4 variable on the root level, to be used inside styles.
        document.body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }

    lockCount++;

    return () => {
        lockCount--;
        if (lockCount === 0) {
            document.body.style.overflow = currentOverflow;
            document.body.style.paddingRight = currentPaddingRight;
        }
    };
}
