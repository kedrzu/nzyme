import { expect, test } from 'vitest';

import { getObjectChanges, trackObjectChanges } from './trackObjectChanges.js';

test('track object changes', () => {
    const obj = trackObjectChanges({
        foo: 'foo',
        bar: 'bar',
    });

    expect(obj.foo).toBe('foo');
    expect(obj.bar).toBe('bar');

    obj.foo = 'baz';

    expect(obj.foo).toBe('baz');
    expect(obj.bar).toBe('bar');

    const changes = getObjectChanges(obj);

    expect(changes).toEqual({
        foo: 'baz',
    });
});
