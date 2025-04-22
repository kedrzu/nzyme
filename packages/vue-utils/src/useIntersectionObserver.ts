import { computed, onMounted, onUnmounted, reactive, ref, unref, watch } from 'vue';
import type { ComponentPublicInstance, Ref } from 'vue';

import { isBrowser } from '@nzyme/dom-utils';

type Options = IntersectionObserverInit & {
    immediate?: boolean;
    onHidden?: () => Promise<void> | void;
    onVisible?: () => Promise<void> | void;
};

/**
 *
 */
export function useIntersectionObserver(
    target: Ref<ComponentPublicInstance | Element | null | undefined>,
    options: Options = { root: null, rootMargin: '0px' },
) {
    const intersectionRatio = ref(0);
    const isIntersecting = ref(false);
    const isFullyInView = ref(false);
    const isSupported = isBrowser() && 'IntersectionObserver' in window;
    const isReadyIntersection = ref(false);
    const element = computed(() => {
        const e = unref(target);
        if (e instanceof Element) {
            return e;
        } else if (e instanceof Object) {
            return e.$el as Element;
        } else {
            return null;
        }
    });

    let observer: IntersectionObserver;

    if (isSupported) {
        onMounted(init);
    }

    watch(element, (el, prevEl) => {
        if (!observer) {
            return;
        }

        if (prevEl) {
            observer.unobserve(prevEl);
        }

        if (el) {
            observer.observe(el);
        }
    });

    function init() {
        observer = new IntersectionObserver(entries => {
            let intersecting = false;

            for (const entry of entries) {
                intersectionRatio.value = entry.intersectionRatio;
                if (entry.intersectionRatio > 0) {
                    isIntersecting.value = true;
                    isFullyInView.value = entry.intersectionRatio >= 1;
                    void options.onVisible?.();
                    intersecting = true;
                    break;
                }
            }

            if (!intersecting) {
                isIntersecting.value = false;
                void options.onHidden?.();
            }

            isReadyIntersection.value = true;
        }, options);

        if (options.immediate !== false) {
            start();
        }
    }

    function start() {
        if (element.value) {
            observer.observe(element.value);
        }
    }

    function pause() {
        if (!observer) {
            return;
        }

        if (element.value) {
            observer.unobserve(element.value);
        }
    }

    onUnmounted(pause);

    return reactive({
        intersectionRatio,
        isSupported,
        isIntersecting,
        isFullyInView,
        isReadyIntersection,
        start,
        pause,
    });
}
