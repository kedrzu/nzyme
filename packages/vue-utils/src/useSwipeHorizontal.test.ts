import { expect, mock, test } from 'bun:test';
import { effectScope } from 'vue';

import { useSwipeHorizontal } from './useSwipeHorizontal.js';

test('useSwipeHorizontal leaves a click with a few pixels of jitter alone', () => {
    const { element, onPan, onSwipe, stop } = setup();

    pointer(element, 'pointerdown', 100);
    pointer(element, 'pointermove', 104, 2);
    pointer(element, 'pointerup', 104, 2);
    const click = pointer(element, 'click', 104, 2);

    expect(onPan).not.toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(false);
    stop();
});

test('useSwipeHorizontal pans after a drag and swallows only the click that ends it', async () => {
    const { element, swipe, onPan, onSwipe, stop } = setup();
    const onClick = mock();
    element.addEventListener('click', onClick);

    pointer(element, 'pointerdown', 100);
    pointer(element, 'pointermove', 80);
    expect(element.style.touchAction).toBe('pan-y');
    expect(swipe.diffX).toBe(-20);
    expect(element.capturedPointer).toBe(1);

    // Slower than a swipe.
    await Bun.sleep(250);
    pointer(element, 'pointerup', 60);
    const click = pointer(element, 'click', 60);

    expect(onPan).toHaveBeenCalledWith(-40);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();

    await new Promise(resolve => {
        setTimeout(resolve);
    });
    expect(swipe.diffX).toBe(0);
    pointer(element, 'click', 60);
    expect(onClick).toHaveBeenCalledTimes(1);
    stop();
});

test('useSwipeHorizontal leaves a vertical drag to the browser', () => {
    const { element, swipe, onPan, stop } = setup();

    pointer(element, 'pointerdown', 100);
    pointer(element, 'pointermove', 102, 20);
    pointer(element, 'pointermove', 60, 20);
    pointer(element, 'pointerup', 60, 20);

    expect(swipe.diffX).toBe(0);
    expect(swipe.isPressing).toBe(false);
    expect(onPan).not.toHaveBeenCalled();
    stop();
});

test('useSwipeHorizontal ignores touch when touch is disabled, but not the mouse', () => {
    const { element, onSwipe, stop } = setup({ touch: false });

    pointer(element, 'pointerdown', 100, 0, 'touch');
    pointer(element, 'pointermove', 50, 0, 'touch');
    pointer(element, 'pointerup', 50, 0, 'touch');
    expect(onSwipe).not.toHaveBeenCalled();

    pointer(element, 'pointerdown', 100);
    pointer(element, 'pointermove', 50);
    pointer(element, 'pointerup', 50);
    expect(onSwipe).toHaveBeenCalledWith(-50);
    stop();
});

test('useSwipeHorizontal stops listening when its scope is disposed', () => {
    const { element, onSwipe, stop } = setup();
    stop();

    pointer(element, 'pointerdown', 100);
    pointer(element, 'pointermove', 50);
    pointer(element, 'pointerup', 50);

    expect(onSwipe).not.toHaveBeenCalled();
});

/** The part of an element the composable uses, on bun's `EventTarget` (bun has no DOM). */
class FakeElement extends EventTarget {
    readonly style = { touchAction: '' };
    readonly ownerDocument = { defaultView: { getComputedStyle: () => ({ touchAction: 'auto' }) } };
    capturedPointer: number | undefined;

    setPointerCapture(pointerId: number) {
        this.capturedPointer = pointerId;
    }
}

function setup(options: { touch?: boolean } = {}) {
    const element = new FakeElement();
    const onPan = mock();
    const onSwipe = mock();
    const scope = effectScope();
    const swipe = scope.run(() =>
        useSwipeHorizontal({
            // A DOM stand-in: bun has no HTMLElement.
            element: element as unknown as HTMLElement,
            onPan,
            onSwipe,
            touch: options.touch,
        }),
    )!;

    return { element, swipe, onPan, onSwipe, stop: () => scope.stop() };
}

function pointer(target: FakeElement, type: string, clientX: number, clientY = 0, pointerType = 'mouse') {
    const event = Object.assign(new Event(type, { cancelable: true }), {
        pointerId: 1,
        pointerType,
        isPrimary: true,
        button: 0,
        clientX,
        clientY,
    });
    target.dispatchEvent(event);
    return event;
}
