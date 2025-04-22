import debounce from 'lodash.debounce';

import { mapNotNull } from '@nzyme/utils';

const queue: Element[] = [];

/**
 * Debounced function that finds the topmost element in the queue and scrolls to it.
 * Elements are sorted by their vertical position, and the highest (smallest top value) is selected.
 */
const scrollToElement = debounce(() => {
    const topElement = mapNotNull(queue, el => {
        if (el.getBoundingClientRect) {
            return {
                el: el,
                top: el.getBoundingClientRect().top,
            };
        }
    }).sort((e1, e2) => e1.top - e2.top)[0]?.el;

    topElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
    });
    queue.length = 0;
}, 100);

/**
 * Scrolls to the given element with smooth animation.
 * When called multiple times for different elements in quick succession,
 * it will identify the element closest to the top of the viewport and scroll to it.
 *
 * @param el The element to scroll into view
 */
export function scrollToTopElement(el: Element) {
    queue.push(el);
    scrollToElement();
}
