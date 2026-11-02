import { expect, test } from 'bun:test';

import { createContainer } from '../Container.js';
import { defineInjectable } from '../Injectable.js';
import { defineService } from '../Service.js';
import { injectLazy } from './injectLazy.js';

test('resolves the injectable lazily and returns the same instance on repeated calls', () => {
    let count = 0;
    const Dep = defineService({
        setup() {
            count++;
            return { id: count };
        },
    });
    const container = createContainer();
    const getDep = container.resolve(injectLazy(Dep));

    expect(count).toBe(0);

    const first = getDep();
    expect(first).toBe(getDep());
    expect(count).toBe(1);
});

test('each container gets its own instance from the same lazy injectable', () => {
    const Dep = defineService({
        setup() {
            return {};
        },
    });
    // Module-level lazy injectable shared by every container, like `deps: { dep: injectLazy(Dep) }`
    const LazyDep = injectLazy(Dep);

    const container1 = createContainer();
    const container2 = createContainer();
    const getDep1 = container1.resolve(LazyDep);
    const getDep2 = container2.resolve(LazyDep);

    expect(getDep1()).toBe(container1.resolve(Dep));
    expect(getDep2()).toBe(container2.resolve(Dep));
    expect(getDep1()).not.toBe(getDep2());
    expect(getDep1()).toBe(getDep1());
    expect(getDep2()).toBe(getDep2());
});

test('a falsy resolved value is resolved only once', () => {
    let count = 0;
    const Falsy = defineInjectable({
        resolve: () => {
            count++;
            return 0;
        },
    });
    const getValue = createContainer().resolve(injectLazy(Falsy));

    expect(getValue()).toBe(0);
    expect(getValue()).toBe(0);
    expect(count).toBe(1);
});
