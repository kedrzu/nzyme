import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createRenderer, defineComponent } from 'vue';

import { createHistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';
import type { HistoryMock } from '@nzyme/dom-utils/createHistoryMock.js';

import { onHistoryBack } from './onHistoryBack.js';

let browser: HistoryMock;

beforeEach(() => {
    browser = createHistoryMock('/start');
    history.pushState(null, '', '/screen');
});

afterEach(() => browser.restore());

test('unmounted after Back has run its callback, it leaves nothing for Back from the next screen to step over', async () => {
    const { unmount } = mountWithHistoryBack(mock());

    history.back();
    await browser.settle();
    history.pushState(null, '', '/next');
    unmount();

    history.back();
    await browser.settle();

    expect(browser.url).toBe('/screen');
});

test('armed again after Back has run its callback, Back runs it again', async () => {
    const callback = mock();
    const { historyBack } = mountWithHistoryBack(callback);

    history.back();
    await browser.settle();
    historyBack.init();
    history.back();
    await browser.settle();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(browser.url).toBe('/screen');
});

function mountWithHistoryBack(callback: () => void) {
    let historyBack: ReturnType<typeof onHistoryBack> | undefined;
    const app = createInertRenderer().createApp(
        defineComponent({
            setup() {
                historyBack = onHistoryBack({ callback });
                historyBack.init();
                return () => null;
            },
        }),
    );
    app.mount({});

    return { historyBack: historyBack!, unmount: () => app.unmount() };
}

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
