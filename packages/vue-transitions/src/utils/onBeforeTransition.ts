/**
 * Set the transition duration and delay on the element.
 */
export function onBeforeTransition(
    el: Element,
    props: {
        duration?: number;
        delay?: number;
    },
) {
    if (!(el instanceof HTMLElement)) {
        return;
    }

    if (props.duration) {
        el.style.transitionDuration = `${props.duration / 1000}s !important`;
    }

    if (props.delay) {
        el.style.transitionDelay = `${props.delay / 1000}s !important`;
    }
}
