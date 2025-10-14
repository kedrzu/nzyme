let scrollBarWidth: number;

/**
 * Gets the width of the browser's scrollbar in pixels.
 * This is useful for calculating layout adjustments when scrollbars appear or disappear.
 * The result is cached for subsequent calls.
 *
 * @returns The width of the scrollbar in pixels
 */
export function getScrollBarWidth() {
    if (scrollBarWidth != null) {
        return scrollBarWidth;
    }

    return (scrollBarWidth = getScrollbarWidthCore());
}

/**
 * Internal implementation that measures the scrollbar width by creating temporary DOM elements.
 * Creates a container with scrollbar and measures the difference between outer and inner widths.
 *
 * @returns The measured scrollbar width in pixels
 */
function getScrollbarWidthCore() {
    // Creating invisible container
    const outer = document.createElement('div');
    outer.style.visibility = 'hidden';
    outer.style.overflow = 'scroll'; // forcing scrollbar to appear
    document.body.appendChild(outer);

    // Creating inner element and placing it in the container
    const inner = document.createElement('div');
    outer.appendChild(inner);

    // Calculating difference between container's full width and the child width
    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

    // Removing temporary elements from the DOM
    outer.remove();

    return scrollbarWidth;
}
