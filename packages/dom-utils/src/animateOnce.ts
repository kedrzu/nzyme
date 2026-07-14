/**
 * Animates an element once by adding and removing a class.
 * @util
 * @param element - The element to animate.
 * @param animationClass - The class to add and remove.
 */
export function animateOnce(element: HTMLElement, animationClass: string) {
    element.classList.remove(animationClass);

    // Force browser to reflow → ensures animation restarts
    void element.offsetWidth;

    element.classList.add(animationClass);

    const listener = () => {
        element.classList.remove(animationClass);
        element.removeEventListener('animationend', listener);
    };

    element.addEventListener('animationend', listener);
}
