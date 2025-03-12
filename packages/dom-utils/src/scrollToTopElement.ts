import debounce from 'lodash.debounce';

import { mapNotNull } from '@nzyme/utils';

const queue: Element[] = [];
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
 * Scrolls to given element.
 * If function is called several times for multiple elements, it will scroll to the top one.
 */
export function scrollToTopElement(el: Element) {
    queue.push(el);
    scrollToElement();
}
