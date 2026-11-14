import { expect, test } from 'bun:test';

import { createEventEmitter } from './createEventEmitter.js';

test('emit calls the next listener when a listener unsubscribes itself', () => {
    const { event, emit } = createEventEmitter<string>();
    const calls: string[] = [];
    const first = (value: string) => {
        calls.push(`first:${value}`);
        event.off(first);
    };
    event.on(first);
    event.on(value => calls.push(`second:${value}`));

    emit('a');
    emit('b');

    expect(calls).toEqual(['first:a', 'second:a', 'second:b']);
});

test('emitAsync calls the next listener when a listener unsubscribes itself', async () => {
    const { event, emitAsync } = createEventEmitter<string>();
    const calls: string[] = [];
    const first = async (value: string) => {
        await Promise.resolve();
        calls.push(`first:${value}`);
        event.off(first);
    };
    event.on(first);
    event.on(value => calls.push(`second:${value}`));

    await emitAsync('a');

    expect(calls).toEqual(['first:a', 'second:a']);
});

test('emit still calls a listener removed by an earlier one in the same emit', () => {
    const { event, emit } = createEventEmitter<string>();
    const calls: string[] = [];
    const second = (value: string) => calls.push(`second:${value}`);
    event.on(value => {
        calls.push(`first:${value}`);
        event.off(second);
    });
    event.on(second);

    emit('a');
    emit('b');

    expect(calls).toEqual(['first:a', 'second:a', 'first:b']);
});
