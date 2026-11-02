import { expect, test } from 'bun:test';
import type { DirectiveBinding } from 'vue';

import { vFocus } from './vFocus.js';

test('focuses the element once its delay has passed', async () => {
    const document = createDocument();
    const input = createElement(document);

    mount(input);
    await waitForFocusDelay();

    expect(document.activeElement).toBe(input);
});

test('does not take focus back from an element focused during its delay', async () => {
    const document = createDocument();
    const email = createElement(document);
    const password = createElement(document);

    mount(email);
    password.focus();
    await waitForFocusDelay();

    expect(document.activeElement).toBe(password);
});

test('focuses the element even when another element held focus before it mounted', async () => {
    const document = createDocument();
    const trigger = createElement(document);
    const input = createElement(document);

    trigger.focus();
    mount(input);
    await waitForFocusDelay();

    expect(document.activeElement).toBe(input);
});

interface FakeDocument {
    body: FakeElement;
    activeElement: FakeElement;
}

interface FakeElement {
    ownerDocument: FakeDocument;
    focus(): void;
}

function createDocument(): FakeDocument {
    const document = { activeElement: null as unknown as FakeElement } as FakeDocument;
    document.body = createElement(document);
    document.activeElement = document.body;
    return document;
}

function createElement(document: FakeDocument): FakeElement {
    const element: FakeElement = {
        ownerDocument: document,
        focus() {
            document.activeElement = element;
        },
    };

    return element;
}

function mount(element: FakeElement) {
    const binding: DirectiveBinding<boolean> = {
        instance: null,
        value: true,
        oldValue: null,
        modifiers: {},
        dir: vFocus,
    };
    vFocus.mounted?.(element as unknown as Element, binding, null as never, null);
}

function waitForFocusDelay() {
    return Bun.sleep(100);
}
