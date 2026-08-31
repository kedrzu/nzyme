import debounce from 'lodash.debounce';

import { mapNotNull } from '@nzyme/utils/array/mapNotNull.js';

const queue: { el: Element; options?: ScrollIntoViewOptions }[] = [];

/**
 * Debounced function that finds the topmost element in the queue and scrolls to it.
 * Elements are sorted by their vertical position, and the highest (smallest top value) is selected.
 */
const scrollToElement = debounce(() => {
    const top = mapNotNull(queue, ({ el, options }) => {
        if (el.getBoundingClientRect) {
            return {
                el: el,
                top: el.getBoundingClientRect().top,
                options: options,
            };
        }

        return undefined;
    }).toSorted((e1, e2) => e1.top - e2.top)[0];

    top?.el?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        ...top.options,
    });

    queue.length = 0;
}, 100);

/**
 * Scrolls to the given element with smooth animation.
 * When called multiple times for different elements in quick succession,
 * it will identify the element closest to the top of the viewport and scroll to it.
 * @util
 *
 * @param el The element to scroll into view
 */
export function scrollToTopElement(el: Element, options?: ScrollIntoViewOptions) {
    queue.push({ el, options });
    scrollToElement();
}
