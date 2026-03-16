import { onMounted, onUnmounted, reactive, ref, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';
import { asArray } from '@nzyme/utils/array/asArray.js';

import { makeRef } from './reactivity/makeRef.js';
import type { ElementOrVue } from './types.js';
import { unwrapElement } from './unwrapElement.js';

/** Configuration for the intersection observer composable. */
export interface UseIntersectionObserverOptions {
    /**
     * Element to observe.
     */
    element?: MaybeRefOrGetter<ElementOrVue | ElementOrVue[] | null | undefined>;
    /**
     * Whether to start observing immediately.
     */
    immediate?: boolean;
    /**
     * Options for the intersection observer.
     */
    options?: MaybeRefOrGetter<IntersectionObserverInit>;
    /**
     * Callback when the element is hidden.
     */
    onHidden?: (el: Element) => Promise<void> | void;
    /**
     * Callback when the element is visible.
     */
    onVisible?: (el: Element) => Promise<void> | void;
}

/** Tracks element visibility using IntersectionObserver with reactive state. */
export function useIntersectionObserver(options: UseIntersectionObserverOptions) {
    const intersectionRatio = ref(0);
    const isIntersecting = ref(false);
    const isFullyInView = ref(false);
    const isSupported = isBrowser() && 'IntersectionObserver' in window;
    const isReadyIntersection = ref(false);

    const element = makeRef(options.element);

    let observer: IntersectionObserver | undefined;

    if (isSupported) {
        onMounted(init);
    }

    onUnmounted(pause);

    watch(element, (el, prevEl) => {
        unobserve(prevEl);
        observe(el);
    });

    function init() {
        observer = new IntersectionObserver(entries => {
            // Sometimes we get the same entry multiple times
            const seen = new Set<Element>();

            for (const entry of entries) {
                if (seen.has(entry.target)) {
                    continue;
                }

                seen.add(entry.target);

                intersectionRatio.value = entry.intersectionRatio;
                if (entry.intersectionRatio > 0) {
                    isIntersecting.value = true;
                    isFullyInView.value = entry.intersectionRatio >= 1;
                    void options.onVisible?.(entry.target);
                } else {
                    void options.onHidden?.(entry.target);
                }
            }

            isReadyIntersection.value = true;
        }, toValue(options.options));

        if (options.immediate !== false) {
            start();
        }
    }

    function start() {
        observe(element.value);
    }

    function pause() {
        unobserve(element.value);
    }

    function observe(el: ElementOrVue | ElementOrVue[] | null | undefined) {
        if (!observer || !el) {
            return;
        }

        const elements = asArray(el);
        for (const element of elements) {
            observer.observe(unwrapElement(element) as Element);
        }
    }

    function unobserve(el: ElementOrVue | ElementOrVue[] | null | undefined) {
        if (!observer || !el) {
            return;
        }

        const elements = asArray(el);
        for (const element of elements) {
            observer.unobserve(unwrapElement(element) as Element);
        }
    }

    return reactive({
        intersectionRatio,
        isSupported,
        isIntersecting,
        isFullyInView,
        isReadyIntersection,
        start,
        pause,
        observe,
        unobserve,
    });
}
