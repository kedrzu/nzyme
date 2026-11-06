/** Which way content scrolls: `left` brings what is left of the view into it, `right` what is right of it. */
export type HorizontalScrollDirection = 'left' | 'right';

/**
 * Whether something from `target` up to `boundary` (excluded) would scroll horizontally in `direction`: an element
 * meant to scroll (`overflow-x` of `auto` or `scroll`), wider inside than it is, and not yet at that edge. A horizontal
 * gesture defers to it, so it does not take over a scroll the user meant.
 * @util
 */
export function canScrollHorizontally(
    target: EventTarget | null,
    direction: HorizontalScrollDirection,
    boundary?: Element | null,
): boolean {
    let current = target;

    while (current && current !== boundary && current instanceof Element) {
        if (current instanceof HTMLElement && canElementScroll(current, direction)) {
            return true;
        }

        current = current.parentElement;
    }

    return false;
}

function canElementScroll(element: HTMLElement, direction: HorizontalScrollDirection) {
    const maxScroll = element.scrollWidth - element.clientWidth;
    if (maxScroll <= 0) {
        return false;
    }

    const { overflowX } = window.getComputedStyle(element);
    if (overflowX !== 'auto' && overflowX !== 'scroll') {
        return false;
    }

    return direction === 'left' ? element.scrollLeft > 0 : element.scrollLeft < maxScroll;
}
