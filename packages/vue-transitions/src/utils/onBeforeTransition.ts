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
        el.style.setProperty('transition-duration', `${props.duration / 1000}s`, 'important');
    }

    if (props.delay) {
        el.style.setProperty('transition-delay', `${props.delay / 1000}s`, 'important');
    }
}
