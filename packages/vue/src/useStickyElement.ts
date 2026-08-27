import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';
import { waitFor } from '@nzyme/utils/waitFor.js';
import { onElementScroll } from '@nzyme/vue-utils/onElementScroll.js';
import { onWindowResize } from '@nzyme/vue-utils/onWindowResize.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { ElementOrVue } from '@nzyme/vue-utils/types.js';
import { unwrapElement } from '@nzyme/vue-utils/unwrapElement.js';
import { useElement } from '@nzyme/vue-utils/useElement.js';
import { useIntervalFn } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { isElementScrollable } from './useScrollableContainer.js';

/**
 * Position of the sticky element.
 */
export type StickyElementPosition = 'bottom' | 'top';

/**
 * Container for the sticky element.
 */
export type StickyElementContainer = ElementOrVue | 'body' | null | undefined;

/**
 * Options for the `useStickyElement` hook.
 */
export interface StickyElementOptions {
    /**
     * Element to make sticky.
     */
    element?: MaybeRefOrGetter<Element | undefined>;
    /**
     * Element to use as a container for the sticky element.
     */
    container?: MaybeRefOrGetter<StickyElementContainer>;
    /**
     * Position of the sticky element.
     */
    position: MaybeRefOrGetter<StickyElementPosition>;
}

/**
 * Hook to make an element sticky.
 *
 * @param options - Options for the hook.
 * @returns A ref to the sticky state.
 */
export function useStickyElement(options: StickyElementOptions) {
    const element = options.element ? makeRef(options.element) : useElement();
    const sticky = ref(false);
    const position = makeRef(options.position);

    const containerRef = options.container ? makeRef(options.container) : null;
    const containerElement = computed(getScrollableContainer);

    let mutationObserver: MutationObserver | null = null;

    onElementScroll(containerElement, updateScroll);
    onWindowResize(updateScroll);
    // for the first time
    onMounted(async () => {
        updateScroll();
        await waitFor(300);
        updateScroll();
    });
    useIntervalFn(updateScroll, 1000);
    // container may change due to some logic races
    watch(containerElement, () => nextTick(updateScroll));
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
            void nextTick(updateScroll);
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

        const container = containerRef?.value;
        if (container === 'body') {
            return document.body;
        }

        if (container) {
            return unwrapElement(container);
        }

        let el: Element | null | undefined = element.value;
        if (!(el instanceof HTMLElement)) {
            return window;
        }

        // Start from the element's parent
        el = el.parentElement;

        while (el) {
            // Check if we've reached the document element
            if (el === document.documentElement) {
                break;
            }

            if (isElementScrollable(el)) {
                return el;
            }

            el = el.parentElement;
        }

        // Check if document.documentElement is scrollable
        if (isElementScrollable(document.documentElement)) {
            return window;
        }

        // Check if document.body is scrollable
        if (document.body && isElementScrollable(document.body)) {
            return document.body;
        }

        // Default to window if no scrollable container found
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

                const stickyOffset = Number.parseInt(styles.bottom, 10);
                const currentOffset = containerRect.bottom - elementRect.bottom;

                return currentOffset <= stickyOffset;
            }
            case 'top': {
                if (containerRect.scrollTop === 0) {
                    // not sticky if we are on the top
                    return false;
                }

                const stickyOffset = Number.parseInt(styles.top, 10);
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
            paddingTop: Number.parseInt(styles.paddingTop, 10),
            paddingBottom: Number.parseInt(styles.paddingBottom, 10),
            scrollTop: Math.round(container.scrollTop),
            scrollBottom: Math.floor(container.scrollHeight - container.scrollTop - container.offsetHeight),
        };
    }
}
