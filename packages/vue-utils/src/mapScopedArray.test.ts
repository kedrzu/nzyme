import { expect, test } from 'bun:test';
import { effectScope, nextTick, onScopeDispose, ref } from 'vue';

import { mapScopedArray } from './mapScopedArray.js';

test('mapScopedArray maps the initial items', () => {
    const scope = effectScope();
    scope.run(() => {
        const source = ref([1, 2, 3]);
        const mapped = mapScopedArray(
            () => source.value,
            x => x * 2,
        );

        expect([...mapped]).toEqual([2, 4, 6]);
    });
    scope.stop();
});

test('mapScopedArray treats a missing source as empty', () => {
    const scope = effectScope();
    scope.run(() => {
        const source = ref<number[] | undefined>(undefined);
        const mapped = mapScopedArray(
            () => source.value,
            x => x,
        );

        expect([...mapped]).toEqual([]);
    });
    scope.stop();
});

test('mapScopedArray appends mapped values when items are added', async () => {
    const scope = effectScope();
    await scope.run(async () => {
        const source = ref([1]);
        const mapped = mapScopedArray(
            () => source.value,
            x => x * 2,
        );

        expect([...mapped]).toEqual([2]);

        source.value.push(2, 3);
        await nextTick();

        expect([...mapped]).toEqual([2, 4, 6]);
    });
    scope.stop();
});

test('mapScopedArray drops values and stops scopes when items are removed', async () => {
    const disposed: number[] = [];
    const scope = effectScope();
    await scope.run(async () => {
        const source = ref([0, 1, 2]);
        const mapped = mapScopedArray(
            () => source.value,
            x => {
                onScopeDispose(() => disposed.push(x));
                return x;
            },
        );

        expect([...mapped]).toEqual([0, 1, 2]);

        source.value.pop();
        await nextTick();

        expect([...mapped]).toEqual([0, 1]);
        expect(disposed).toEqual([2]);
    });
    scope.stop();
});

test('mapScopedArray tracks length only, retaining the first N results on shrink', async () => {
    const disposed: string[] = [];
    const scope = effectScope();
    await scope.run(async () => {
        const source = ref(['a', 'b', 'c']);
        const mapped = mapScopedArray(
            () => source.value,
            x => {
                onScopeDispose(() => disposed.push(x));
                return x.toUpperCase();
            },
        );

        // Replacing with a shorter array keeps the first two scopes and drops the third.
        source.value = ['a', 'c'];
        await nextTick();

        expect([...mapped]).toEqual(['A', 'B']);
        expect(disposed).toEqual(['c']);
    });
    scope.stop();
});

test('mapScopedArray stops item scopes when the parent scope stops', () => {
    const disposed: number[] = [];
    const scope = effectScope();
    scope.run(() => {
        const source = ref([1, 2]);
        mapScopedArray(
            () => source.value,
            x => {
                onScopeDispose(() => disposed.push(x));
                return x;
            },
        );
    });

    scope.stop();

    expect(disposed.toSorted()).toEqual([1, 2]);
});
