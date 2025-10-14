/**
 * Returns the total height of an element's children.
 * Calculates the maximum bottom position of all children, even if the parent element has overflow.
 *
 * @param element The parent HTML element whose children's height to measure
 * @returns The maximum height in pixels needed to contain all children
 */
export function getChildrenHeight(element: HTMLElement) {
    let height = 0;

    for (const child of element.children) {
        if (!(child instanceof HTMLElement)) {
            continue;
        }

        const marginBottom = parseInt(getComputedStyle(child).marginBottom, 10);
        const bottom = child.offsetHeight + child.offsetTop + marginBottom;

        if (bottom > height) {
            height = bottom;
        }
    }

    return height;
}
