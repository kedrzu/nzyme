import { expect, test } from 'vitest';

import { defineCommand } from './Command.js';
import { createContainer } from './Container.js';
import { defineInterface } from './Interface.js';
import { defineService } from './Service.js';

test('resolve command with no deps', () => {
    const container = createContainer();

    let count = 0;

    const command = defineCommand({
        setup() {
            count++;
            return (value: number) => {
                return value;
            };
        },
    });

    expect(count).toBe(0);

    const resolved = container.resolve(command);
    expect(count).toBe(0); // Commands are lazily resolved
    expect(resolved(4)).toBe(4);
    expect(count).toBe(1);

    // Resolved commands are cached
    const other = container.resolve(command);
    expect(other).not.toBe(resolved); // Cached function is a different instance
    expect(count).toBe(1);

    expect(other(4)).toBe(4);
    expect(count).toBe(1);
});

test('resolve command registered as injectable', () => {
    const container = createContainer();

    let count = 0;

    const injectable = defineInterface<(value: number) => number>();

    const command = defineCommand({
        implements: injectable,
        setup() {
            count++;
            return (value: number) => {
                return value;
            };
        },
    });

    container.set(injectable, command);

    expect(count).toBe(0);

    const resolved = container.resolve(injectable);
    expect(count).toBe(0); // Commands are lazily resolved
    expect(resolved(4)).toBe(4);
    expect(count).toBe(1);

    // Resolved commands are cached
    const other = container.resolve(injectable);
    expect(other).not.toBe(resolved); // Cached function is a different instance
    expect(count).toBe(1);

    expect(other(5)).toBe(5);
    expect(count).toBe(1);

    // Resolve command directly
    const direct = container.resolve(command);
    expect(direct).not.toBe(resolved); // Cached function is a different instance
    expect(direct(6)).toBe(6);
    expect(count).toBe(1);
});

test('resolve command with service dependency', () => {
    const container = createContainer();

    let serviceCount = 0;
    const service = defineService({
        setup() {
            serviceCount++;
            return 'foo';
        },
    });

    let commandCount = 0;
    const command = defineCommand({
        deps: {
            service,
        },
        setup({ service }) {
            commandCount++;
            return (value: number) => {
                return value;
            };
        },
    });

    expect(serviceCount).toBe(0);
    expect(commandCount).toBe(0);

    const resolvedCommand = container.resolve(command);
    expect(serviceCount).toBe(0); // Commands are lazily resolved
    expect(commandCount).toBe(0); // Commands are lazily resolved
    expect(resolvedCommand(4)).toBe(4);
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);

    // Resolved commands are cached
    const resolvedCommand2 = container.resolve(command);
    expect(resolvedCommand2).not.toBe(resolvedCommand); // Cached function is a different instance
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);

    expect(resolvedCommand2(4)).toBe(4);
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);
});

test('resolve service with command dependency', () => {
    const container = createContainer();

    let commandCount = 0;
    const command = defineCommand({
        setup() {
            commandCount++;
            return (value: number) => {
                return value;
            };
        },
    });

    let serviceCount = 0;
    const service = defineService({
        deps: {
            command,
        },
        setup({ command }) {
            serviceCount++;
            return command;
        },
    });

    expect(serviceCount).toBe(0);
    expect(commandCount).toBe(0);

    const resolvedService = container.resolve(service);
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(0); // Commands are lazily resolved
    expect(resolvedService(4)).toBe(4);
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);

    // Resolved commands are cached
    const resolvedCommand = container.resolve(command);
    expect(resolvedCommand).not.toBe(resolvedService); // Cached function is a different instance
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);

    expect(resolvedCommand(4)).toBe(4);
    expect(serviceCount).toBe(1);
    expect(commandCount).toBe(1);
});
