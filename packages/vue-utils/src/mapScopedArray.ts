import { effectScope, watch } from 'vue';
import type { EffectScope } from 'vue';

import { reactive } from './reactivity/reactive.js';

/**
 * Maps each element of a reactive source array to a derived value, running every
 * element's `map` call inside its own {@link EffectScope}.
 *
 * The returned array tracks the source's length: appended elements get a fresh
 * scope and a mapped result, while removed elements have their scope stopped —
 * disposing any scope-bound effects registered during mapping (watchers, window
 * listeners via `onScopeDispose`, keyboard shortcuts, …) — and their results
 * dropped. All item scopes are children of the calling scope, so they are also
 * disposed when it stops.
 *
 * Reach for this instead of a plain `array.map(...)` whenever the per-item
 * mapping registers scope-bound effects: a bare `.map()` runs them in the
 * caller's scope and leaks them when the source array changes.
 *
 * Only the source's length is tracked, so each `map` result is tied to its
 * index. Callers that need per-element value reactivity should read the element
 * by index inside `map` (e.g. via a `computed`) rather than capturing the
 * snapshot passed as the first argument.
 *
 * @param source - Getter for the reactive source array; only its length is tracked.
 * @param map - Maps an element (and its index) to a derived value, inside the element's scope.
 * @returns Reactive array of mapped values, one per source element.
 */
export function mapScopedArray<T, V>(source: () => readonly T[] | undefined, map: (item: T, index: number) => V): V[] {
    const items = reactive<V[]>([]);
    const scopes: EffectScope[] = [];

    watch(
        () => source()?.length,
        (newLength = 0, oldLength = 0) => {
            if (newLength > oldLength) {
                for (let i = oldLength; i < newLength; i++) {
                    const scope = effectScope();
                    const item = scope.run(() => map(source()![i]!, i)) as V;

                    scopes.push(scope);
                    items.push(item);
                }
            } else if (newLength < oldLength) {
                for (let i = oldLength - 1; i >= newLength; i--) {
                    scopes[i]!.stop();
                }

                scopes.length = newLength;
                items.length = newLength;
            }
        },
        { immediate: true },
    );

    return items;
}
