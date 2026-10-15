import { afterEach, expect, mock, test } from 'bun:test';

import { createHistoryMock } from './createHistoryMock.js';
import type { HistoryMock } from './createHistoryMock.js';
import { onHistoryBack } from './virtualHistory.js';

let browser: HistoryMock | undefined;

afterEach(() => browser?.restore());

test('Back over an entry whose callback was cancelled steps on to the screen before it', async () => {
    browser = openScreens();
    const callback = mock();
    onHistoryBack(callback).cancel();

    history.back();
    await browser.settle();

    expect(browser.url).toBe('/start');
    expect(callback).not.toHaveBeenCalled();
});

test('a navigation made while the step over a cancelled entry is landing stays', async () => {
    browser = openScreens();
    onHistoryBack(mock()).cancel();
    onNextPopState(() => history.pushState(null, '', '/next'));
    const appPopState = mock();
    window.addEventListener('popstate', appPopState);

    history.back();
    await browser.settle();

    expect(browser.url).toBe('/next');
    expect(browser.urls).toEqual(['/start', '/screen', '/next']);
    // Only the user's Back: a listener added after nzyme's never sees the step undo the navigation, nor the
    // way back to it.
    expect(appPopState).toHaveBeenCalledTimes(1);
});

test('an entry added while the step over a cancelled entry is landing is not closed by it', async () => {
    browser = openScreens();
    onHistoryBack(mock()).cancel();
    const callback = mock();
    onNextPopState(() => onHistoryBack(callback));

    history.back();
    await browser.settle();

    expect(browser.url).toBe('/screen');
    expect(callback).not.toHaveBeenCalled();

    history.back();
    await browser.settle();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(browser.url).toBe('/screen');
});

function openScreens() {
    const opened = createHistoryMock('/start');
    history.pushState(null, '', '/screen');

    return opened;
}

/** Runs `listener` on the next popstate, after nzyme's own listener — as a router reacting to Back would. */
function onNextPopState(listener: () => void) {
    window.addEventListener('popstate', listener, { once: true });
}
