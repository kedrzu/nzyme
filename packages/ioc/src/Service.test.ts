import { Container } from './Container.js';
import { defineInjectable } from './Injectable.js';
import { defineService } from './Service.js';

test('resolve service with no deps', () => {
    const container = new Container();

    let count = 0;

    const service = defineService({
        setup() {
            count++;
            return 'foo';
        },
    });

    let resolved = container.resolve(service);
    expect(resolved).toBe('foo');
    expect(count).toBe(1);

    // Should be cached
    resolved = container.resolve(service);
    expect(resolved).toBe('foo');
    expect(count).toBe(1);
});

test('resolve service with deps', () => {
    let service1Count = 0;
    let service2Count = 0;
    let service3Count = 0;

    const Service1 = defineService({
        name: 'service1',
        setup() {
            service1Count++;
            return 'service1';
        },
    });

    const Service2 = defineService({
        name: 'service2',

        setup({ inject }) {
            const service1 = inject(Service1);
            service2Count++;
            expect(service1).toBe('service1');
            return 'service2';
        },
    });

    const service3 = defineService({
        name: 'service3',

        setup({ inject }) {
            const service1 = inject(Service1);
            const service2 = inject(Service2);
            service3Count++;
            expect(service1).toBe('service1');
            expect(service2).toBe('service2');
            return 'service3';
        },
    });

    const container = new Container();

    expect(service1Count).toBe(0);
    expect(service2Count).toBe(0);
    expect(service3Count).toBe(0);

    const service2Resolved = container.resolve(Service2);
    expect(service2Resolved).toBe('service2');
    expect(service1Count).toBe(1);
    expect(service2Count).toBe(1);
    expect(service3Count).toBe(0);

    const service3Resolved = container.resolve(service3);
    expect(service3Resolved).toBe('service3');
    expect(service1Count).toBe(1);
    expect(service2Count).toBe(1);
    expect(service3Count).toBe(1);

    const service1Resolved = container.resolve(Service1);
    expect(service1Resolved).toBe('service1');
    expect(service1Count).toBe(1);
    expect(service2Count).toBe(1);
    expect(service3Count).toBe(1);
});

test('register service as injectable - resolve injectable first', () => {
    const injectable = defineInjectable<{ foo: string }>({
        name: 'foobar',
    });
    let serviceCount = 0;

    const service = defineService({
        for: injectable,
        name: 'service',
        setup() {
            serviceCount++;
            return {
                foo: 'bar',
            };
        },
    });

    const container = new Container();

    container.set(injectable, service);
    const injectableInstance1 = container.resolve(injectable);
    const injectableInstance2 = container.resolve(injectable);
    const serviceInstance1 = container.resolve(service);
    const serviceInstance2 = container.resolve(service);

    expect(injectableInstance1.foo).toBe('bar');
    expect(injectableInstance2).toBe(injectableInstance1);
    expect(serviceInstance1).toBe(injectableInstance1);
    expect(serviceInstance2).toBe(injectableInstance1);
    expect(serviceCount).toBe(1);
});

test('register service as injectable - resolve service first', () => {
    const Injectable = defineInjectable<{ foo: string }>({
        name: 'foobar',
    });
    let serviceCount = 0;

    const Service = defineService({
        for: Injectable,
        name: 'service',
        setup() {
            serviceCount++;
            return {
                foo: 'bar',
            };
        },
    });

    const container = new Container();

    container.set(Injectable, Service);
    const serviceInstance1 = container.resolve(Service);
    const serviceInstance2 = container.resolve(Service);
    const injectableInstance1 = container.resolve(Injectable);
    const injectableInstance2 = container.resolve(Injectable);

    expect(injectableInstance1.foo).toBe('bar');
    expect(injectableInstance2).toBe(injectableInstance1);
    expect(serviceInstance1).toBe(injectableInstance1);
    expect(serviceInstance2).toBe(injectableInstance1);
    expect(serviceCount).toBe(1);
});

describe('child containers', () => {
    test('service with root scope with no deps', () => {
        const parent = new Container();
        const child = parent.createChild();

        let count = 0;

        const service = defineService({
            scope: 'root',
            setup() {
                count++;
                return {
                    foo: 'bar',
                };
            },
        });

        const resolvedParent = parent.resolve(service);
        expect(resolvedParent.foo).toBe('bar');
        expect(count).toBe(1);

        const resolvedChild = child.resolve(service);
        expect(resolvedChild).toBe(resolvedParent);
        expect(count).toBe(1);
    });

    test('service with child scope with no deps', () => {
        const parent = new Container();
        const child = parent.createChild();

        let count = 0;

        const service = defineService({
            scope: 'child',
            setup() {
                count++;
                return {
                    foo: 'bar',
                };
            },
        });

        const resolvedParent = parent.tryResolve(service);
        expect(resolvedParent).toBeUndefined();
        expect(count).toBe(0);

        const resolvedChild = child.resolve(service);
        expect(resolvedChild.foo).toBe('bar');
        expect(count).toBe(1);
    });

    test('service with child scope with deps', () => {
        let service1Count = 0;
        let service2Count = 0;
        let service3Count = 0;

        const Service1 = defineService({
            name: 'service1',
            scope: 'root',
            setup() {
                service1Count++;
                return { name: 'service1' };
            },
        });

        const Service2 = defineService({
            name: 'service2',
            scope: 'child',
            setup({ inject }) {
                const service1 = inject(Service1);
                service2Count++;
                expect(service1.name).toBe('service1');
                return { name: 'service2' };
            },
        });

        const Service3 = defineService({
            name: 'service3',
            scope: 'child',
            setup({ inject }) {
                const service1 = inject(Service1);
                const service2 = inject(Service2);
                service3Count++;
                expect(service1.name).toBe('service1');
                expect(service2.name).toBe('service2');
                return { name: 'service3' };
            },
        });

        const parent = new Container();
        const child = parent.createChild();

        expect(service1Count).toBe(0);
        expect(service2Count).toBe(0);
        expect(service3Count).toBe(0);

        const service2Resolved = child.resolve(Service2);
        expect(service2Resolved.name).toBe('service2');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(0);

        const service3Resolved = child.resolve(Service3);
        expect(service3Resolved.name).toBe('service3');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(1);

        const service1Resolved = child.resolve(Service1);
        expect(service1Resolved.name).toBe('service1');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(1);

        expect(parent.tryResolve(Service1)).toBe(service1Resolved);
        expect(parent.tryResolve(Service2)).toBeUndefined();
        expect(parent.tryResolve(Service3)).toBeUndefined();
    });

    test('service with child scope with deps in nested container', () => {
        let service1Count = 0;
        let service2Count = 0;
        let service3Count = 0;

        const Service1 = defineService({
            name: 'service1',
            scope: 'root',
            setup() {
                service1Count++;
                return { name: 'service1' };
            },
        });

        const Service2 = defineService({
            name: 'service2',
            scope: 'child',
            setup({ inject }) {
                const service1 = inject(Service1);
                service2Count++;
                expect(service1.name).toBe('service1');
                return { name: 'service2' };
            },
        });

        const Service3 = defineService({
            name: 'service3',
            scope: 'child',
            setup({ inject }) {
                const service1 = inject(Service1);
                const service2 = inject(Service2);
                service3Count++;
                expect(service1.name).toBe('service1');
                expect(service2.name).toBe('service2');
                return { name: 'service3' };
            },
        });

        const parent = new Container();
        const child = parent.createChild();
        const grandchild = child.createChild();

        expect(service1Count).toBe(0);
        expect(service2Count).toBe(0);
        expect(service3Count).toBe(0);

        const service2Resolved = child.resolve(Service2);
        expect(service2Resolved.name).toBe('service2');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(0);

        // Should inject from parent
        const service3Resolved = grandchild.resolve(Service3);
        expect(service3Resolved.name).toBe('service3');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(1);

        const service1Resolved = grandchild.resolve(Service1);
        expect(service1Resolved.name).toBe('service1');
        expect(service1Count).toBe(1);
        expect(service2Count).toBe(1);
        expect(service3Count).toBe(1);

        expect(parent.get(Service1)).toBe(service1Resolved);
        expect(parent.get(Service2)).toBeUndefined();
        expect(parent.get(Service3)).toBeUndefined();

        expect(child.get(Service1)).toBe(service1Resolved);
        expect(child.get(Service2)).toBe(service2Resolved);
        expect(child.get(Service3)).toBeUndefined();

        expect(grandchild.get(Service1)).toBe(service1Resolved);
        expect(grandchild.get(Service2)).toBe(service2Resolved);
        expect(grandchild.get(Service3)).toBe(service3Resolved);
    });
});
