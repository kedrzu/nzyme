/**
 * Checks if one element is an ancestor (parent, grandparent, etc.) of another element.
 *
 * @param ancestor The potential ancestor element to check
 * @param element The descendant element to check against
 * @returns True if the ancestor contains the element in its descendant tree, false otherwise
 */
export function isAncestorOf(ancestor: Element, element: Element) {
    let parent = element.parentElement;

    while (parent) {
        if (ancestor === parent) {
            return true;
        }

        parent = parent.parentElement;
    }

    return false;
}
