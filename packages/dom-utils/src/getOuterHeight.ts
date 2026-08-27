/**
 * Calculates the total outer height of an element including margins.
 * @util
 * @param element The HTML element to measure
 * @returns The total height including the element's height plus top and bottom margins
 */
export function getOuterHeight(element: HTMLElement) {
    const window = element.ownerDocument.defaultView!;
    const style = window.getComputedStyle(element);

    const height = element.offsetHeight;
    const marginTop = Number.parseInt(style.getPropertyValue('margin-top'), 10);
    const marginBottom = Number.parseInt(style.getPropertyValue('margin-bottom'), 10);

    return height + marginBottom + marginTop;
}
