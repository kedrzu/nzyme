import { afterEach, beforeEach, expect, test } from 'bun:test';
import { defineComponent } from 'vue';

import { createHistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';
import type { HistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { CancelError } from '@nzyme/utils/CancelError.js';

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
