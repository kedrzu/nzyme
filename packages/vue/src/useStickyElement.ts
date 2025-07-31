import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { isBrowser } from '@nzyme/dom-utils';
import type { ElementOrVue, RefParam } from '@nzyme/vue-utils';
import { makeRef, onElementScroll, onWindowResize, unwrapElement } from '@nzyme/vue-utils';

/**
 * Position of the sticky element.
 */
export type StickyElementPosition = 'bottom' | 'top';

/**
 * Options for the `useStickyElement` hook.
 */
export interface StickyElementOptions {
    /**
     * Element to make sticky.
     */
    element: RefParam<Element | undefined>;
    /**
     * Element to use as a container for the sticky element.
     */
    container?: RefParam<ElementOrVue | null | undefined>;
    /**
     * Position of the sticky element.
     */
    position: RefParam<StickyElementPosition>;
}

/**
 * Hook to make an element sticky.
 *
 * @param options - Options for the hook.
 * @returns A ref to the sticky state.
 */
export function useStickyElement(options: StickyElementOptions) {
    const element = makeRef(options.element);
    const sticky = ref(false);
    const position = makeRef(options.position);

    const containerElement = options.container ? makeRef(options.container) : computed(getScrollableContainer);

    let mutationObserver: MutationObserver | null = null;

    onElementScroll(containerElement, updateScroll);
    onWindowResize(updateScroll);
    // for the first time
    onMounted(updateScroll);
    // container may change due to some logic races
    watch(containerElement, updateScroll);
    // watch for changes in container element and setup mutation observer
    watch(containerElement, setupMutationObserver, { immediate: true });
    onBeforeUnmount(cleanupMutationObserver);

    return sticky;

    function setupMutationObserver() {
        cleanupMutationObserver();

        const container = unwrapElement(containerElement.value);
        if (!container || container instanceof Window || !isBrowser()) {
            return;
        }

        mutationObserver = new MutationObserver(() => {
            updateScroll();
        });

        mutationObserver.observe(container, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false,
        });
    }

    function cleanupMutationObserver() {
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }
    }

    function getScrollableContainer() {
        if (!isBrowser()) {
            return null;
        }

        let el = element.value || null;
        if (!(el instanceof HTMLElement)) {
            return null;
        }

        while (el) {
            if (el === document.body) {
                return window;
            }

            if (el.scrollHeight > el.clientHeight) {
                const styles = getComputedStyle(el);
                if (styles.overflowY === 'scroll' || styles.overflowY === 'auto') {
                    return el as HTMLElement;
                }
            }

            el = el.parentElement;
        }

        return window;
    }

    function updateScroll() {
        sticky.value = isElementSticky();
    }

    function isElementSticky() {
        const el = element.value;
        if (!(el instanceof HTMLElement)) {
            return false;
        }

        const styles = getComputedStyle(el);
        if (styles.position !== 'sticky') {
            return false;
        }

        const containerRect = getContainerRect();
        const elementRect = el.getBoundingClientRect();

        switch (position.value) {
            case 'bottom': {
                if (containerRect.scrollBottom === 0) {
                    // not sticky if we are on the bottom
                    return false;
                }

                const stickyOffset = parseInt(styles.bottom);
                const currentOffset = containerRect.bottom - elementRect.bottom;

                return currentOffset <= stickyOffset;
            }
            case 'top': {
                if (containerRect.scrollTop === 0) {
                    // not sticky if we are on the top
                    return false;
                }

                const stickyOffset = parseInt(styles.top);
                const currentOffset = elementRect.top - containerRect.top - containerRect.paddingTop;

                return currentOffset <= stickyOffset;
            }
        }
    }

    function getContainerRect() {
        const container = unwrapElement(containerElement.value);
        if (!container || container instanceof Window) {
            const scrollHeight = Math.max(
                document.scrollingElement?.scrollHeight || 0,
                document.body.scrollHeight,
                document.body.offsetHeight,
            );

            return {
                top: 0,
                bottom: window.innerHeight,
                paddingTop: 0,
                paddingBottom: 0,
                scrollTop: Math.round(window.scrollY),
                scrollBottom: Math.floor(scrollHeight - window.scrollY - window.innerHeight),
            };
        }

        if (!(container instanceof HTMLElement)) {
            return {
                top: 0,
                bottom: window.innerHeight,
                paddingTop: 0,
                paddingBottom: 0,
            };
        }

        const rect = container.getBoundingClientRect();
        const styles = window.getComputedStyle(container);

        return {
            top: rect.top,
            bottom: rect.bottom,
            paddingTop: parseInt(styles.paddingTop),
            paddingBottom: parseInt(styles.paddingBottom),
            scrollTop: Math.round(container.scrollTop),
            scrollBottom: Math.floor(container.scrollHeight - container.scrollTop - container.offsetHeight),
        };
    }
}
