import { expect, test } from 'vitest';

import { createContainer } from './Container.js';
import { defineScope } from './ContainerScope.js';
import { defineInterface } from './Interface.js';

test('register and get interface', () => {
    const container = createContainer();
    const injectable = defineInterface<string>();

    container.set(injectable, 'test');
    expect(container.get(injectable)).toBe('test');
});

test('register and get named interface', () => {
    const container = createContainer();
    const injectable = defineInterface<string>({
        name: 'test',
    });

    container.set(injectable, 'test');
    expect(container.get(injectable)).toBe('test');
});

test('get non registered interface', () => {
    const container = createContainer();
    const injectable = defineInterface<string>({
        name: 'test',
    });

    expect(container.get(injectable)).toBe(undefined);
});

test('resolve interface from parent container', () => {
    const parent = createContainer();
    const childScope = defineScope('child');
    const child = parent.createChild(childScope);

    const injectable = defineInterface<string>({
        name: 'test',
    });

    parent.set(injectable, 'test');

    expect(child.get(injectable)).toBe(undefined);
    expect(child.resolve(injectable)).toBe('test');
});
