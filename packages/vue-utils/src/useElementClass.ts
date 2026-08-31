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
 * Composable for dynamically managing CSS classes on DOM elements.
 * Automatically adds and removes classes based on reactive changes to the class and element references.
 * Useful for managing global styles on elements like body, html, or other target elements.
 *
 * @param options - Configuration object for class management
 * @param options.class - Reactive reference to CSS classes (string, array, or falsy)
 * @param options.elements - Reactive reference to target elements (single element or array)
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { useElementClass } from '@nzyme/vue-utils/useElementClass.js';
 *
 * const isDark = ref(false);
 * const isFullscreen = ref(false);
 *
 * // Apply theme classes to body
 * useElementClass({
 *   class: () => [
 *     isDark.value && 'dark-theme',
 *     isFullscreen.value && 'fullscreen'
 *   ],
 *   elements: () => document.body
 * });
 *
 * // Toggle theme
 * isDark.value = true; // Adds 'dark-theme' class to body
 * </script>
 * ```
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

    function addClass(targetElements: ElementParam | ElementParam[], targetClasses: ClassParam) {
        forEachElement(targetElements, targetClasses, (element, classNames) => {
            element.classList.add(...classNames);
        });
    }

    function removeClass(targetElements: ElementParam | ElementParam[], targetClasses: ClassParam) {
        forEachElement(targetElements, targetClasses, (element, classNames) => {
            element.classList.remove(...classNames);
        });
    }

    function forEachElement(
        targetElements: ElementParam | ElementParam[],
        targetClasses: ClassParam,
        callback: (element: Element, classes: string[]) => void,
    ) {
        targetElements = normalizeElements(targetElements);
        if (!targetElements) {
            return;
        }

        targetClasses = normalizeClass(targetClasses);
        if (!targetClasses) {
            return;
        }

        for (const element of targetElements) {
            if (element) {
                callback(element, targetClasses);
            }
        }
    }

    function normalizeElements(targetElements: ElementParam | ElementParam[]) {
        if (!targetElements) {
            return null;
        }

        if (Array.isArray(targetElements)) {
            return targetElements;
        }

        return [targetElements];
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
