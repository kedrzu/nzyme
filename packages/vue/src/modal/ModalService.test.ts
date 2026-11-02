import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createRenderer, defineComponent, h, Suspense } from 'vue';

import { createHistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';
import type { HistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { CancelError } from '@nzyme/utils/CancelError.js';
import { waitFor } from '@nzyme/utils/waitFor.js';

import { ModalService } from './ModalService.js';

const Dialog = defineComponent({ render: () => null });

let browser: HistoryMock;

beforeEach(() => {
    browser = createHistoryMock('/start');
    // `open()` clears the focus, which looks for an `HTMLElement` to blur; with no element focused, any class does.
    Object.defineProperty(globalThis, 'HTMLElement', { value: EventTarget, configurable: true });
    history.pushState(null, '', '/screen');
});

afterEach(() => {
    browser.restore();
    Reflect.deleteProperty(globalThis, 'HTMLElement');
});

test('after Back has closed a modal, Back from a screen opened next returns to the screen under it', async () => {
    const modals = createContainer().resolve(ModalService);
    const modal = modals.open(Dialog);

    history.back();
    await browser.settle();

    expect(modal.controller.open).toBe(false);
    expect(await modal.catch((error: unknown) => error)).toBeInstanceOf(CancelError);

    history.pushState(null, '', '/next');
    history.back();
    await browser.settle();

    expect(browser.url).toBe('/screen');
});

test('Escape closes a modal and rejects its promise like `close()`', async () => {
    const modals = createContainer().resolve(ModalService);
    const modal = modals.open(Dialog);
    const app = createInertRenderer().createApp({
        render: () => h(Suspense, null, { default: () => h(modal.component) }),
    });
    Object.defineProperty(globalThis, 'document', { value: new EventTarget(), configurable: true });
    try {
        app.mount({});
        // The modal component's setup is async, so it renders only once Suspense has resolved it.
        await waitFor(0);

        document.dispatchEvent(Object.assign(new Event('keyup'), { key: 'Escape' }));
        const outcome = await Promise.race([
            modal.then(
                () => 'resolved',
                (error: unknown) => error,
            ),
            waitFor(50, 'unsettled'),
        ]);

        expect(modal.controller.open).toBe(false);
        expect(outcome).toBeInstanceOf(CancelError);
    } finally {
        app.unmount();
        Reflect.deleteProperty(globalThis, 'document');
    }
});

/** A renderer that renders nothing, so that a component can be mounted and unmounted without a DOM. */
function createInertRenderer() {
    return createRenderer<object, object>({
        insert() {},
        remove() {},
        createElement: () => ({}),
        createText: () => ({}),
        createComment: () => ({}),
        setText() {},
        setElementText() {},
        parentNode: () => null,
        nextSibling: () => null,
        patchProp() {},
    });
}
