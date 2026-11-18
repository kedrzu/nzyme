import { expect, test } from 'bun:test';

import { splitPipeFrames } from './splitPipeFrames.js';

test('splits complete frames and keeps the incomplete tail', () => {
    const result = splitPipeFrames(Buffer.from('{"id":1}\0{"id":2}\0{"id"'));

    expect(result.frames).toEqual(['{"id":1}', '{"id":2}']);
    expect(result.rest.toString()).toBe('{"id"');
});

test('joins a character split across chunks once its frame is complete', () => {
    const message = Buffer.from('{"title":"Zażółć"}\0');
    const cut = message.indexOf(Buffer.from('ż')) + 1;

    const first = splitPipeFrames(message.subarray(0, cut));
    const second = splitPipeFrames(Buffer.concat([first.rest, message.subarray(cut)]));

    expect(first.frames).toEqual([]);
    expect(second.frames).toEqual(['{"title":"Zażółć"}']);
    expect(second.rest.length).toBe(0);
});
