/**
 * Forces a synchronous reflow of an element, so a style set just before it becomes the starting point of a CSS transition.
 * @util
 * @param element The element to reflow
 */
export function forceReflow(element: Element) {
    // Reading a computed layout property flushes pending style changes.
    void getComputedStyle(element).height;
}
