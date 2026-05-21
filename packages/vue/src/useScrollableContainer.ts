import type { ElementOrVue } from '@nzyme/vue-utils/types.js';
import { unwrapElement } from '@nzyme/vue-utils/unwrapElement.js';
import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

/**
 * Walks up the DOM from `element` and returns the nearest ancestor that is
 * actually vertically scrollable (overflow auto/scroll AND a real scrollbar).
 *
 * Returns `null` when only the window scrolls or when the element is not
 * mounted yet. Callers that need a "viewport" sentinel (e.g. the native
 * `IntersectionObserver` API) can use `null` directly — `window` is not a
 * valid `root` for that API.
 */
export function useScrollableContainer(element: MaybeRefOrGetter<ElementOrVue | null | undefined>) {
    return computed<HTMLElement | null>(() => {
        const el = unwrapElement(toValue(element));
        if (!el || !(el instanceof Element)) {
            return null;
        }

        let current: Element | null = el.parentElement;
        while (current) {
            if (isElementScrollable(current)) {
                return current as HTMLElement;
            }
            current = current.parentElement;
        }

        return null;
    });
}

/** Checks whether an element has a vertical scrollbar via computed overflow styles. */
export function isElementScrollable(element: Element): boolean {
    const style = getComputedStyle(element);
    const overflowY = style.overflowY;
    const isScrollableOverflow = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (!isScrollableOverflow) {
        return false;
    }

    return element.scrollHeight > element.clientHeight;
}
