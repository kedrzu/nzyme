import { onMounted, onUnmounted, watch } from 'vue';

import type { RefParam } from './reactivity/makeRef.js';
import { makeRef } from './reactivity/makeRef.js';
import type { ElementOrVue } from './types.js';
import { unwrapElement } from './unwrapElement.js';

type MaybeElement = ElementOrVue | null | undefined;

/** Registers a scroll event listener on the given element, auto-cleaning up on unmount. */
export function onElementScroll(element: RefParam<MaybeElement>, callback: (event: Event) => void) {
    const elementRef = makeRef(element);

    watch(
        () => elementRef.value,
        (current, previous) => {
            disconnect(previous);
            connect(current);
        },
    );

    onMounted(() => connect(elementRef.value));
    onUnmounted(() => disconnect(elementRef.value));

    function connect(el: MaybeElement) {
        unwrapElement(el)?.addEventListener('scroll', callback, { passive: true });
    }

    function disconnect(el: MaybeElement) {
        unwrapElement(el)?.removeEventListener('scroll', callback);
    }
}
