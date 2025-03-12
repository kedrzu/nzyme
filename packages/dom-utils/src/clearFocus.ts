/**
 * Clear the focus from the current element.
 */
export function clearFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
        active.blur();
    }
}
