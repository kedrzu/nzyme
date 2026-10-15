import { computed, onScopeDispose, reactive, ref, watch } from 'vue';

import { readonly } from '@nzyme/utils/readonly.js';

import { makeRef } from './reactivity/makeRef.js';
import type { RefParam } from './reactivity/makeRef.js';
import { useElement } from './useElement.js';

/** Configuration for horizontal swipe gesture detection. */
export interface UseSwipeOptions {
    /**
     * Target element for swipe detection. Unless its CSS sets a `touch-action`, it gets `pan-y`: the
     * browser keeps scrolling the page vertically and leaves horizontal pans to the swipe (with `auto` it
     * would take every touch pan and cancel the pointer).
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
     * Enable touch (and pen) event support
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
 * How far (px) a pointer may move while pressed and still count as a click: the jitter of a hand on a
 * mouse or a finger on glass must not start a pan and swallow the click.
 */
const DRAG_THRESHOLD = 6;

/**
 * Composable for handling horizontal swipe gestures on an element, with Pointer Events (mouse, touch and
 * pen through one code path).
 *
 * A gesture starts once the pointer has moved {@link DRAG_THRESHOLD} px; a vertical one is left to the
 * browser. After a gesture, the click that ends it is swallowed so a link or button under the pointer
 * does not fire.
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
        pointerId: undefined as number | undefined,
        startX: undefined as number | undefined,
        startY: undefined as number | undefined,
        startTimestamp: undefined as number | undefined,
        currentX: undefined as number | undefined,
        startTarget: null as EventTarget | null,
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

    watch(
        element,
        (newEl, oldEl) => {
            if (oldEl) {
                removeListeners(oldEl);
            }

            if (newEl) {
                addListeners(newEl);
            }
        },
        { immediate: true },
    );

    onScopeDispose(() => {
        if (element.value) {
            removeListeners(element.value);
        }
    });

    return state;

    function addListeners(el: HTMLElement) {
        if (touchEnabled && el.ownerDocument.defaultView?.getComputedStyle(el).touchAction === 'auto') {
            el.style.touchAction = 'pan-y';
        }

        el.addEventListener('pointerdown', onPointerDown, { passive: true });
        el.addEventListener('pointermove', onPointerMove, { passive: true });
        el.addEventListener('pointerup', onPointerUp, { passive: true });
        el.addEventListener('pointercancel', onPointerCancel, { passive: true });
        el.addEventListener('pointerleave', onPointerLeave, { passive: true });
        el.addEventListener('dragstart', onDragStart);
    }

    function removeListeners(el: HTMLElement) {
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerCancel);
        el.removeEventListener('pointerleave', onPointerLeave);
        el.removeEventListener('dragstart', onDragStart);
        el.removeEventListener('click', swallowClick, { capture: true });
    }

    function onPointerDown(event: PointerEvent) {
        if (!event.isPrimary || !isPointerEnabled(event) || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }

        swipeStart(event);
    }

    function onPointerMove(event: PointerEvent) {
        if (event.pointerId !== position.pointerId) {
            return;
        }

        swipeMove(event);
    }

    function onPointerUp(event: PointerEvent) {
        if (event.pointerId !== position.pointerId) {
            return;
        }

        swipeEnd(event.clientX);
    }

    function onPointerCancel(event: PointerEvent) {
        // The browser took the gesture over (e.g. a vertical scroll on touch): no swipe, no pan.
        if (event.pointerId === position.pointerId) {
            swipeReset();
        }
    }

    function onPointerLeave(event: PointerEvent) {
        // Before the gesture captures the pointer, a release outside the element would never reach it.
        if (event.pointerId === position.pointerId && !isMoving.value) {
            swipeReset();
        }
    }

    function onDragStart(event: DragEvent) {
        // A native drag of an image or link would cancel the pointer and end the swipe half-way.
        if (isPressing.value) {
            event.preventDefault();
        }
    }

    function isPointerEnabled(event: PointerEvent) {
        return event.pointerType === 'mouse' ? mouseEnabled : touchEnabled;
    }

    /**
     * Initializes swipe tracking when user starts pressing.
     * Records the starting position, timestamp, and target element for later calculations.
     */
    function swipeStart(event: PointerEvent) {
        if (!enabled.value) {
            return;
        }

        position.pointerId = event.pointerId;
        position.startX = event.clientX;
        position.startY = event.clientY;
        position.startTimestamp = Date.now();
        position.startTarget = event.target;

        isPressing.value = true;
    }

    /**
     * Handles pointer movement during a potential swipe gesture.
     *
     * Once the pointer has moved past the drag threshold, determines if this is a horizontal swipe by
     * comparing deltaX vs deltaY. If vertical movement dominates, the gesture is cancelled.
     *
     * Also checks if the swipe direction conflicts with a scrollable container
     * in the DOM hierarchy - if so, the native scroll takes precedence.
     */
    function swipeMove(event: PointerEvent) {
        if (!isPressing.value) {
            return;
        }

        const x = event.clientX;

        if (!isMoving.value) {
            const deltaX = Math.abs(x - (position.startX ?? 0));
            const deltaY = Math.abs(event.clientY - (position.startY ?? 0));

            // Still a click: a hand is never perfectly still.
            if (deltaX < DRAG_THRESHOLD && deltaY < DRAG_THRESHOLD) {
                return;
            }

            // Cancel if this looks like a vertical scroll rather than horizontal swipe
            if (deltaY > deltaX) {
                swipeReset();
                return;
            }

            // Determine swipe direction: negative = left, positive = right
            const swipeDirection = x - (position.startX ?? 0);

            // Defer to native scroll if a scrollable container can scroll in this direction
            if (position.startTarget && isSwipeBlockedByScrollableContainer(position.startTarget, swipeDirection)) {
                swipeReset();
                return;
            }

            isMoving.value = true;

            // Only now: captured from the press, the click would target the element, not what was pressed.
            element.value?.setPointerCapture(event.pointerId);
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
     * A press that never passed the drag threshold is a click: no callback, and the click goes through.
     *
     * The deltaX passed to callbacks is negative for left, positive for right.
     */
    function swipeEnd(x: number) {
        if (!isMoving.value) {
            swipeReset();
            return;
        }

        isPressing.value = false;
        position.pointerId = undefined;

        const deltaX = x - (position.startX ?? 0);
        const deltaTime = Date.now() - (position.startTimestamp ?? 0);

        const swipeMaxTime = 200;
        const swipeMinDistance = 15;
        const isSwipe = deltaTime < swipeMaxTime && Math.abs(deltaX) > swipeMinDistance;

        if (isSwipe && options.onSwipe) {
            options.onSwipe(deltaX);
        } else {
            options.onPan?.(deltaX);
        }

        // The click that ends the gesture is dispatched right after this pointerup, in the same task.
        const el = element.value;
        el?.addEventListener('click', swallowClick, { capture: true });

        setTimeout(() => {
            el?.removeEventListener('click', swallowClick, { capture: true });
            swipeReset();
        });
    }

    function swipeReset() {
        isPressing.value = false;
        isMoving.value = false;
        position.pointerId = undefined;
        position.currentX = undefined;
        position.startX = undefined;
        position.startY = undefined;
        position.startTimestamp = undefined;
        position.startTarget = null;
    }

    function swallowClick(event: Event) {
        // Immediate: with the pointer captured, the click may target the element itself.
        event.preventDefault();
        event.stopImmediatePropagation();
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
    function isSwipeBlockedByScrollableContainer(target: EventTarget, swipeDirection: number): boolean {
        let current: EventTarget | null = target;

        while (current && current !== element.value && current instanceof Element) {
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
