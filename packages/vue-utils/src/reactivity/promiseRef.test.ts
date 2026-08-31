import { expect, test } from 'bun:test';

import { promiseRef } from './promiseRef.js';

test('creates empty promiseRef with undefined value', () => {
    const ref = promiseRef();

    expect(ref.value).toBeUndefined();
    expect(ref.pending).toBeNull();
});

test('creates promiseRef from initial value', () => {
    const ref = promiseRef('initial');

    expect(ref.value).toBe('initial');
    expect(ref.pending).toBeNull();
});

test('creates promiseRef from promise', async () => {
    const promise = Promise.resolve('resolved');
    const ref = promiseRef(promise);

    expect(ref.value).toBeUndefined();
    expect(ref.pending).toBe(ref.promise);

    const result = await ref.promise;
    expect(result).toBe('resolved');
    expect(ref.value).toBe('resolved');
    expect(ref.pending).toBeNull();
});

test('promise property returns resolved promise when value is set', async () => {
    const ref = promiseRef('test');

    const result = await ref.promise;
    expect(result).toBe('test');
});

test('updates ref with new promise', async () => {
    const ref = promiseRef('initial');

    const newPromise = Promise.resolve('updated');
    const returnedPromise = ref.update(newPromise);

    expect(ref.pending).not.toBeNull();
    expect(returnedPromise).toBe(ref.promise);

    const result = await returnedPromise;
    expect(result).toBe('updated');
    expect(ref.value).toBe('updated');
    expect(ref.pending).toBeNull();
});

test('handles multiple sequential updates', async () => {
    const ref = promiseRef<string>();

    const promise1 = Promise.resolve('first');
    await ref.update(promise1);
    expect(ref.value).toBe('first');

    const promise2 = Promise.resolve('second');
    await ref.update(promise2);
    expect(ref.value).toBe('second');

    const promise3 = Promise.resolve('third');
    await ref.update(promise3);
    expect(ref.value).toBe('third');
});

test('handles race condition - last promise wins', async () => {
    const ref = promiseRef<string>();

    let resolveFirst: (value: string) => void;
    let resolveSecond: (value: string) => void;

    const firstPromise = new Promise<string>(resolve => {
        resolveFirst = resolve;
    });
    const secondPromise = new Promise<string>(resolve => {
        resolveSecond = resolve;
    });

    void ref.update(firstPromise);
    void ref.update(secondPromise);

    // Resolve first promise after second one was set
    resolveFirst!('first');
    await new Promise(resolve => {
        setTimeout(resolve, 10);
    });

    // First promise should not update the value since second promise is pending
    expect(ref.value).toBeUndefined();

    resolveSecond!('second');
    await ref.promise;

    expect(ref.value).toBe('second');
});

test('clears pending when value is set directly', async () => {
    const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('resolved'), 100);
    });

    const ref = promiseRef(promise);
    expect(ref.pending).not.toBeNull();

    ref.value = 'manual';
    expect(ref.value).toBe('manual');

    // Wait for Vue's watch to trigger
    await new Promise(resolve => {
        setTimeout(resolve, 0);
    });
    expect(ref.pending).toBeNull();
});

test('handles promise rejection gracefully', async () => {
    const error = new Error('test error');
    const promise = Promise.reject(error);
    const ref = promiseRef(promise);

    expect(ref.value).toBeUndefined();
    expect(ref.pending).not.toBeNull();

    try {
        await ref.promise;
        throw new Error('Expected promise to reject');
    } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe('test error');
    }

    // Value remains undefined after rejection
    expect(ref.value).toBeUndefined();
});

test('handles rejected promise in update', async () => {
    const ref = promiseRef('initial');
    const error = new Error('update error');
    const failedPromise = Promise.reject(error);

    const returnedPromise = ref.update(failedPromise);

    try {
        await returnedPromise;
        throw new Error('Expected promise to reject');
    } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe('update error');
    }

    // Value remains as initial after rejection
    expect(ref.value).toBe('initial');
});

test('pending is null after promise resolves', async () => {
    const promise = Promise.resolve('value');
    const ref = promiseRef(promise);

    expect(ref.pending).not.toBeNull();

    await ref.promise;

    expect(ref.pending).toBeNull();
});

test('supports complex object types', async () => {
    interface User {
        id: number;
        name: string;
    }

    const user: User = { id: 1, name: 'John' };
    const ref = promiseRef(user);

    expect(ref.value).toEqual({ id: 1, name: 'John' });

    const newUser: User = { id: 2, name: 'Jane' };
    await ref.update(Promise.resolve(newUser));

    expect(ref.value).toEqual({ id: 2, name: 'Jane' });
});

test('handles undefined as a valid value', async () => {
    const ref = promiseRef<string | undefined>(undefined);

    expect(ref.value).toBeUndefined();
    expect(ref.pending).toBeNull();

    await ref.update(Promise.resolve(undefined));

    expect(ref.value).toBeUndefined();
    expect(ref.pending).toBeNull();
});

test('handles null as a valid value', async () => {
    const ref = promiseRef<string | null>(null);

    expect(ref.value).toBeNull();

    await ref.update(Promise.resolve('value'));
    expect(ref.value).toBe('value');

    await ref.update(Promise.resolve(null));
    expect(ref.value).toBeNull();
});

test('promise property updates when update is called', () => {
    const ref = promiseRef('initial');
    const initialPromise = ref.promise;

    void ref.update(Promise.resolve('updated'));
    const updatedPromise = ref.promise;

    expect(updatedPromise).not.toBe(initialPromise);
});

test('handles empty arrays and empty objects', async () => {
    const arrayRef = promiseRef<number[]>([]);
    expect(arrayRef.value).toEqual([]);

    const objectRef = promiseRef<Record<string, unknown>>({});
    expect(objectRef.value).toEqual({});

    await arrayRef.update(Promise.resolve([1, 2, 3]));
    expect(arrayRef.value).toEqual([1, 2, 3]);

    await objectRef.update(Promise.resolve({ key: 'value' }));
    expect(objectRef.value).toEqual({ key: 'value' });
});

test('handles very fast promise resolution', async () => {
    const ref = promiseRef(Promise.resolve('fast'));

    // Even though promise resolves immediately, value may not be set yet
    const result = await ref.promise;

    expect(result).toBe('fast');
    expect(ref.value).toBe('fast');
});

test('multiple rapid updates only apply last one', async () => {
    const ref = promiseRef<number>();

    let resolve1: (value: number) => void;
    let resolve2: (value: number) => void;
    let resolve3: (value: number) => void;

    const p1 = new Promise<number>(r => {
        resolve1 = r;
    });
    const p2 = new Promise<number>(r => {
        resolve2 = r;
    });
    const p3 = new Promise<number>(r => {
        resolve3 = r;
    });

    void ref.update(p1);
    void ref.update(p2);
    void ref.update(p3);

    // Resolve in reverse order
    resolve1!(1);
    await new Promise(resolve => {
        setTimeout(resolve, 10);
    });
    expect(ref.value).toBeUndefined();

    resolve2!(2);
    await new Promise(resolve => {
        setTimeout(resolve, 10);
    });
    expect(ref.value).toBeUndefined();

    resolve3!(3);
    await ref.promise;
    expect(ref.value).toBe(3);
});

test('setting promise property directly works', async () => {
    const ref = promiseRef('initial');

    ref.promise = Promise.resolve('updated');

    expect(ref.pending).not.toBeNull();

    await ref.promise;

    expect(ref.value).toBe('updated');
    expect(ref.pending).toBeNull();
});

test('handles boolean values', async () => {
    const ref = promiseRef(true);
    expect(ref.value).toBe(true);

    await ref.update(Promise.resolve(false));
    expect(ref.value).toBe(false);
});

test('handles numeric values including zero', async () => {
    const ref = promiseRef(0);
    expect(ref.value).toBe(0);

    await ref.update(Promise.resolve(42));
    expect(ref.value).toBe(42);

    await ref.update(Promise.resolve(0));
    expect(ref.value).toBe(0);
});

test('handles empty string as value', async () => {
    const ref = promiseRef('');
    expect(ref.value).toBe('');

    await ref.update(Promise.resolve('non-empty'));
    expect(ref.value).toBe('non-empty');

    await ref.update(Promise.resolve(''));
    expect(ref.value).toBe('');
});
