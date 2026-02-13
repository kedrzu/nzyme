import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { isAncestorOf } from '@nzyme/dom-utils/isAncestorOf.js';
import { readonly } from '@nzyme/utils/readonly.js';

import { makeRef } from './reactivity/makeRef.js';
import type { RefParam } from './reactivity/makeRef.js';
import { useElement } from './useElement.js';

/**
 *
 */
export interface UseSwipeOptions {
    /**
     * Target element for swipe detection
     * @default currentElement
     */
    element?: RefParam<HTMLElement | undefined>;
    /**
     * Whether swipe detection is enabled (reactive)
     * @default true
     */
    enabled?: RefParam<boolean>;
    /**
     * Enable mouse event support
     * @default true
     */
    mouse?: boolean;
    /**
     * Enable touch event support
     * @default true
     */
    touch?: boolean;
    /**
     * Callback for pan gestures (slower movements)
     */
    onPan?(distance: number): void;
    /**
     * Callback for swipe gestures (quick movements)
     */
    onSwipe?(distance: number): void;
}

/**
 * Composable for handling horizontal swipe gestures on an element.
 * Supports both mouse and touch events with configurable options.
 *
 * @param options - Configuration options for swipe behavior
 * @returns Readonly reactive state with diffX, isMoving, and isPressing properties
 */
export function useSwipeHorizontal(options: UseSwipeOptions) {
    const element = options.element ? makeRef(options.element) : useElement<HTMLElement>();
    const enabled = options.enabled ? makeRef(options.enabled) : ref(true);
    const touchEnabled = options.touch ?? true;
    const mouseEnabled = options.mouse ?? true;

    const position = reactive({
        startX: undefined as number | undefined,
        startY: undefined as number | undefined,
        startTimestamp: undefined as number | undefined,
        currentX: undefined as number | undefined,
        startTarget: undefined as Element | undefined,
    });

    const isMoving = ref(false);
    const isPressing = ref(false);

    const diffX = computed(() => {
        if (!isMoving.value) {
            return 0;
        }

        return (position.currentX ?? 0) - (position.startX ?? 0);
    });

    const state = readonly(
        reactive({
            diffX,
            isMoving,
            isPressing,
        }),
    );

    watch(element, (newEl, oldEl) => {
        if (oldEl) {
            if (mouseEnabled) {
                oldEl.removeEventListener('mousedown', onMouseDown);
            }
            if (touchEnabled) {
                oldEl.removeEventListener('touchstart', onTouchStart);
            }
        }

        if (newEl) {
            if (mouseEnabled) {
                newEl.addEventListener('mousedown', onMouseDown, { passive: true });
            }
            if (touchEnabled) {
                newEl.addEventListener('touchstart', onTouchStart, { passive: true });
            }
        }
    });

    onBeforeUnmount(() => {
        removeMouseListeners();
        removeTouchListeners();
    });

    return state;

    function addMouseListeners() {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseEnd);
        document.body.addEventListener('mouseleave', onMouseEnd);
    }

    function removeMouseListeners() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseEnd);
        document.body.removeEventListener('mouseleave', onMouseEnd);
    }

    function addTouchListeners() {
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove);
        document.body.addEventListener('touchend', onTouchEnd, { passive: true });
    }

    function removeTouchListeners() {
        document.removeEventListener('touchmove', onTouchMove);
        document.body.removeEventListener('touchend', onTouchEnd);
    }

    function onMouseDown(event: MouseEvent) {
        if (!mouseEnabled || isInvalidEvent(event)) {
            return;
        }

        addMouseListeners();
        swipeStart(event.clientX, event.clientY, event.target as Element);
    }

    function onMouseMove(event: MouseEvent) {
        swipeMove(event.clientX, event.clientY);
        event.preventDefault();
    }

    function onMouseEnd(event: MouseEvent) {
        removeMouseListeners();
        swipeEnd(event.clientX);
    }

    function onTouchStart(event: TouchEvent) {
        if (!touchEnabled) {
            return;
        }

        const touch = event.touches[0];
        if (!touch) {
            return;
        }

        if (isInvalidEvent(event)) {
            return;
        }

        addTouchListeners();
        swipeStart(touch.clientX, touch.clientY, event.target as Element);
    }

    function onTouchMove(event: TouchEvent) {
        const touch = event.touches[0];
        if (!touch) {
            return;
        }

        swipeMove(touch.clientX, touch.clientY);
        event.preventDefault();
    }

    function onTouchEnd(event: TouchEvent) {
        removeTouchListeners();
        const touch = event.changedTouches[0];
        if (!touch) {
            return;
        }

        swipeEnd(touch.clientX);
    }

    /**
     * Initializes swipe tracking when user starts pressing.
     * Records the starting position, timestamp, and target element for later calculations.
     */
    function swipeStart(x: number, y: number, target: Element) {
        if (!enabled.value) {
            return;
        }

        position.startX = x;
        position.startY = y;
        position.startTimestamp = new Date().valueOf();
        position.startTarget = target;

        isPressing.value = true;
    }

    /**
     * Handles pointer movement during a potential swipe gesture.
     *
     * On first movement, determines if this is a horizontal swipe by comparing
     * deltaX vs deltaY. If vertical movement dominates, the gesture is cancelled.
     *
     * Also checks if the swipe direction conflicts with a scrollable container
     * in the DOM hierarchy - if so, the native scroll takes precedence.
     */
    function swipeMove(x: number, y: number) {
        if (!isPressing.value) {
            return;
        }

        if (!isMoving.value) {
            const deltaX = Math.abs(x - (position.startX ?? 0));
            const deltaY = Math.abs(y - (position.startY ?? 0));

            // Cancel if this looks like a vertical scroll rather than horizontal swipe
            if (deltaY > deltaX) {
                isPressing.value = false;
                return;
            }

            // Determine swipe direction: negative = left, positive = right
            const swipeDirection = x - (position.startX ?? 0);

            // Defer to native scroll if a scrollable container can scroll in this direction
            if (position.startTarget && isSwipeBlockedByScrollableContainer(position.startTarget, swipeDirection)) {
                isPressing.value = false;
                return;
            }

            isMoving.value = true;
        }

        position.currentX = x;
    }

    /**
     * Finalizes the swipe gesture and triggers appropriate callbacks.
     *
     * Distinguishes between a "swipe" (quick flick) and a "pan" (slower drag):
     * - Swipe: completed within 200ms and moved at least 15px
     * - Pan: anything else (slower or shorter movement)
     *
     * The deltaX passed to callbacks is negative for left, positive for right.
     */
    function swipeEnd(x: number) {
        if (!isPressing.value && !isMoving.value) {
            return;
        }

        isPressing.value = false;

        const deltaX = x - (position.startX ?? 0);
        const deltaTime = new Date().valueOf() - (position.startTimestamp ?? 0);

        const swipeMaxTime = 200;
        const swipeMinDistance = 15;
        const isSwipe = deltaTime < swipeMaxTime && Math.abs(deltaX) > swipeMinDistance;

        if (isSwipe && options.onSwipe) {
            options.onSwipe(deltaX);
        } else {
            options.onPan?.(deltaX);
        }

        setTimeout(() => {
            isMoving.value = false;
            position.currentX = undefined;
            position.startX = undefined;
            position.startY = undefined;
            position.startTimestamp = undefined;
            position.startTarget = undefined;
        });
    }

    function isInvalidEvent(event: Event) {
        return (
            // no element
            !event.target ||
            !element.value ||
            // event target is not within element
            !(isAncestorOf(element.value, event.target as Element) || element.value === event.target)
        );
    }

    /**
     * Checks if a swipe gesture should be blocked because a scrollable container
     * in the DOM hierarchy can scroll in the same direction.
     *
     * This prevents swipe gestures from interfering with native horizontal scrolling.
     * Only considers elements that:
     * 1. Have overflow-x set to 'auto' or 'scroll' (intentionally scrollable)
     * 2. Have content wider than the container (scrollWidth > clientWidth)
     * 3. Can actually scroll in the swipe direction (not already at the edge)
     *
     * @param target - The element where the swipe started
     * @param swipeDirection - Negative for left swipe, positive for right swipe
     * @returns true if the swipe should be blocked to allow native scrolling
     */
    function isSwipeBlockedByScrollableContainer(target: Element, swipeDirection: number): boolean {
        let current: Element | null = target;

        while (current && current !== element.value) {
            if (current instanceof HTMLElement) {
                const style = window.getComputedStyle(current);
                const isScrollable = style.overflowX === 'auto' || style.overflowX === 'scroll';
                const hasHorizontalScroll = current.scrollWidth > current.clientWidth;

                if (hasHorizontalScroll && isScrollable) {
                    const canScrollLeft = current.scrollLeft > 0;
                    const canScrollRight = current.scrollLeft < current.scrollWidth - current.clientWidth;

                    // Swiping right (positive direction) is blocked if container can scroll left
                    if (swipeDirection > 0 && canScrollLeft) {
                        return true;
                    }

                    // Swiping left (negative direction) is blocked if container can scroll right
                    if (swipeDirection < 0 && canScrollRight) {
                        return true;
                    }
                }
            }

            current = current.parentElement;
        }

        return false;
    }
}
