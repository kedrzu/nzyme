import { expect, test } from 'bun:test';

import { mapStacks } from './mapStacks.js';

test('mapStacks builds one entry per key, passing the key to the factory', () => {
    const result = mapStacks(['a', 'b'] as const, ({ key }) => ({ id: key }));

    expect(result).toEqual({ a: { id: 'a' }, b: { id: 'b' } });
});
