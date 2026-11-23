// Because scroll lock can be called from multiple components,
// we need to track how many components are locking the scroll.

import { getScrollBarWidth } from './getScrollBarWidth.js';

// Otherwise one component releasing the lock would release it for all.
/* oxlint-disable nzyme/no-module-state -- The lock mirrors the one document body: its count and the styles saved
   from the body are that global's state, and every lock a test takes it releases again. */
let lockCount = 0;
let currentPaddingRight = '';
let currentOverflow = '';
/* oxlint-enable nzyme/no-module-state */

/**
 * Locks the body scroll to prevent page scrolling, typically used for modals and overlays.
 * Handles multiple lock requests by tracking the lock count, ensuring that the scroll remains
 * locked until all locks are released. Compensates for scrollbar width to prevent layout shifts.
 * @util
 *
 * @returns A cleanup function that unlocks the scroll when called. Must be called to release the lock.
 */
export function lockBodyScroll() {
    if (lockCount === 0) {
        const scrollbarWidth = getScrollBarWidth();
        currentPaddingRight = document.body.style.paddingRight;
        currentOverflow = document.body.style.overflow;

        const computedPaddingRight = Number.parseFloat(getComputedStyle(document.body).paddingRight);

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
