/**
 * Clears the focus from the currently focused element in the document.
 * This is useful to hide focus rings or blur input elements programmatically.
 * @util
 */
export function clearFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
        active.blur();
    }
}
