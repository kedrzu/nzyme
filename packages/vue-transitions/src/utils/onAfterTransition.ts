/**
 * Reset the transition duration and delay on the element.
 */
export function onAfterTransition(el: Element) {
    if (el instanceof HTMLElement) {
        el.style.transitionDuration = '';
        el.style.transitionDelay = '';
    }
}
