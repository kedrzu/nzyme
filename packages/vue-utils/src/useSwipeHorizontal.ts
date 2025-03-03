import { onBeforeUnmount, reactive, ref, computed, watch } from 'vue';

import { isAncestorOf } from '@nzyme/dom-utils';
import { readonly } from '@nzyme/utils';

import { makeRef, type RefParam } from './reactivity/makeRef.js';
import { useElement } from './useElement.js';

type SwipeOptions = {
    element?: RefParam<HTMLElement | undefined>;
    enabled?: RefParam<boolean>;
    onSwipe?(distance: number): void;
    onPan?(distance: number): void;
};

export function useSwipeHorizontal(options: SwipeOptions) {
    const element = options.element ? makeRef(options.element) : useElement<HTMLElement>();
    const enabled = options.enabled ? makeRef(options.enabled) : ref(true);

    const position = reactive({
        startX: undefined as number | undefined,
        startY: undefined as number | undefined,
        startTimestamp: undefined as number | undefined,
        currentX: undefined as number | undefined,
    });

    const isMoving = ref(false);
    const isMouseDown = ref(false);

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
            isMouseDown,
        }),
    );

    watch(element, (newEl, oldEl) => {
        if (oldEl) {
            oldEl.removeEventListener('mousedown', onMouseDown);
            oldEl.removeEventListener('touchstart', onTouchStart);
        }

        if (newEl) {
            newEl.addEventListener('mousedown', onMouseDown, { passive: true });
            newEl.addEventListener('touchstart', onTouchStart, { passive: true });
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
        if (isInvalidEvent(event)) {
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

        isMouseDown.value = true;
    }

    function swipeMove(x: number, y: number) {
        if (!isMouseDown.value) {
            return;
        }

        if (!isMoving.value) {
            const deltaX = Math.abs(x - (position.startX ?? 0));
            const deltaY = Math.abs(y - (position.startY ?? 0));

            if (deltaY > deltaX) {
                isMouseDown.value = false;
                return;
            }

            isMoving.value = true;
        }

        position.currentX = x;
    }

    function swipeEnd(x: number) {
        if (!isMouseDown.value && !isMoving.value) {
            return;
        }

        isMouseDown.value = false;

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
