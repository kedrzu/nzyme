import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onBeforeUnmount, watch } from 'vue';
import type { RenderFunction } from 'vue';

import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';
import { cancelIdleCallback, requestIdleCallback } from '@nzyme/dom-utils/requestIdleCallback.js';
import { createPromise } from '@nzyme/utils/createPromise.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

/**
 *
 */
export const LazyHydrate = defineComponent({
    name: 'LazyHydrate',
    props: {
        whenIdle: defineProp<boolean | IdleRequestOptions>(),
        whenVisible: defineProp<boolean | IntersectionObserverInit>(),
        whenTriggered: Boolean,
    },
    emits: ['hydrated'],
    setup(props, ctx) {
        const instance = getCurrentInstance()!;
        let hydrated = !isBrowser() || props.whenTriggered || !instance.vnode.el;

        if (hydrated) {
            return render;
        }

        const cleanups: (() => void)[] = [];
        const asyncRender = createPromise<RenderFunction>();

        // Async component, that is resolved when hydrated.
        // This way vue will wait for the component to be hydrated before rendering it.
        const component = defineAsyncComponent({
            loader: () => asyncRender.promise,
            suspensible: false,
        });

        const hydrate = () => {
            if (hydrated) {
                return;
            }

            cleanups.forEach(cleanup => cleanup());
            asyncRender.resolve(render);
            hydrated = true;
            ctx.emit('hydrated');
        };

        onBeforeUnmount(() => {
            cleanups.forEach(cleanup => cleanup());
        });

        // Handle whenTriggered prop
        cleanups.push(
            watch(
                () => props.whenTriggered,
                whenTriggered => {
                    if (whenTriggered) {
                        hydrate();
                    }
                },
            ),
        );

        // Handle whenIdle prop
        cleanups.push(
            watch(
                () => props.whenIdle,
                (whenIdle, _, onCleanup) => {
                    if (!whenIdle) {
                        return;
                    }

                    const idleCallbackId = requestIdleCallback(hydrate, whenIdle === true ? undefined : whenIdle);

                    onCleanup(() => cancelIdleCallback(idleCallbackId));
                },
                { immediate: true },
            ),
        );

        // Handle whenVisible prop
        cleanups.push(
            watch(
                [() => props.whenVisible],
                ([whenVisible], _, onCleanup) => {
                    if (!whenVisible) {
                        return;
                    }

                    const element = instance.vnode.el;
                    if (!element) {
                        return;
                    }

                    const observerOptions =
                        typeof props.whenVisible === 'object' ? props.whenVisible : { rootMargin: '100px' };

                    const io = new IntersectionObserver(entries => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting || entry.intersectionRatio > 0) {
                                hydrate();
                            }
                        });
                    }, observerOptions ?? undefined);

                    if (element instanceof Element) {
                        io.observe(element);
                    } else if (Array.isArray(element)) {
                        for (const el of element) {
                            if (el instanceof Element) {
                                io.observe(el);
                            }
                        }
                    }

                    onCleanup(() => io.disconnect());
                },
                { immediate: true },
            ),
        );

        return () => h(component);

        function render() {
            const nodes = ctx.slots.default?.() ?? [];
            if (nodes.length > 1) {
                console.warn('LazyHydrate can have only one child.');
            }

            return nodes[0];
        }
    },
});
