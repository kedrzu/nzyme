import { expect, test } from 'bun:test';

import { cachedProp } from './cachedProp.js';

test('cached decorated prop is called only once', () => {
    let timesCalled = 0;

    class Foo {
        public readonly foo = 'foo';

        @cachedProp
        public get bar() {
            timesCalled++;
            return this.foo;
        }
    }

    const x = new Foo();

    expect(timesCalled).toBe(0);

    const value1 = x.bar;
    expect(value1).toBe('foo');
    expect(timesCalled).toBe(1);

    const value2 = x.bar;
    expect(value2).toBe('foo');
    expect(timesCalled).toBe(1);

    const y = new Foo();
    expect(timesCalled).toBe(1);

    const value3 = y.bar;
    expect(value3).toBe('foo');
    expect(timesCalled).toBe(2);
});
