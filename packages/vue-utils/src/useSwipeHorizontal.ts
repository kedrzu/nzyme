import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { isAncestorOf } from '@nzyme/dom-utils';
import { readonly } from '@nzyme/utils';

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
        swipeStart(event.clientX, event.clientY);
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
        swipeStart(touch.clientX, touch.clientY);
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

    function swipeStart(x: number, y: number) {
        if (!enabled.value) {
            return;
        }

        position.startX = x;
        position.startY = y;
        position.startTimestamp = new Date().valueOf();

        isPressing.value = true;
    }

    function swipeMove(x: number, y: number) {
        if (!isPressing.value) {
            return;
        }

        if (!isMoving.value) {
            const deltaX = Math.abs(x - (position.startX ?? 0));
            const deltaY = Math.abs(y - (position.startY ?? 0));

            if (deltaY > deltaX) {
                isPressing.value = false;
                return;
            }

            isMoving.value = true;
        }

        position.currentX = x;
    }

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
        });
    }

    function isInvalidEvent(event: Event) {
        return (
            // no element
            !event.target ||
            !element.value ||
            // event target is not within element
            !isAncestorOf(element.value, event.target as Element)
        );
    }
}
