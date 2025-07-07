import { onUnmounted, watch } from 'vue';

import { onMountedInScope } from './onMountedInScope.js';
import { makeRef } from './reactivity/makeRef.js';
import type { RefParam } from './reactivity/makeRef.js';

type ElementParam = Element | null | undefined;
type ClassParam = string | string[] | false | null | undefined;

type GlobalClassOptions = {
    class: RefParam<ClassParam>;
    elements: RefParam<ElementParam | ElementParam[]>;
};

/**
 * @description
 * This hook is used to add and remove classes to elements.
 * It is useful for adding and removing classes to elements like body, html, etc.
 */
export function useElementClass(options: GlobalClassOptions) {
    const classes = makeRef(options.class);
    const elements = makeRef(options.elements);

    onMountedInScope(() => {
        watch(classes, (newClasses, oldClasses) => {
            const elementsValue = elements.value;
            removeClass(elementsValue, oldClasses);
            addClass(elementsValue, newClasses);
        });

        watch(elements, (newElements, oldElements) => {
            const classesValue = classes.value;
            removeClass(oldElements, classesValue);
            addClass(newElements, classesValue);
        });

        addClass(elements.value, classes.value);
    });

    onUnmounted(() => removeClass(elements.value, classes.value));

    function addClass(elements: ElementParam | ElementParam[], classes: ClassParam) {
        forEachElement(elements, classes, (element, classes) => {
            element.classList.add(...classes);
        });
    }

    function removeClass(elements: ElementParam | ElementParam[], classes: ClassParam) {
        forEachElement(elements, classes, (element, classes) => {
            element.classList.remove(...classes);
        });
    }

    function forEachElement(
        elements: ElementParam | ElementParam[],
        classes: ClassParam,
        callback: (element: Element, classes: string[]) => void,
    ) {
        elements = normalizeElements(elements);
        if (!elements) {
            return;
        }

        classes = normalizeClass(classes);
        if (!classes) {
            return;
        }

        for (const element of elements) {
            if (element) {
                callback(element, classes);
            }
        }
    }

    function normalizeElements(elements: ElementParam | ElementParam[]) {
        if (!elements) {
            return null;
        }

        if (Array.isArray(elements)) {
            return elements;
        }

        return [elements];
    }

    function normalizeClass(cls: ClassParam) {
        if (Array.isArray(cls)) {
            return cls;
        }

        if (typeof cls === 'string') {
            return cls.split(' ');
        }

        return null;
    }
}
