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
