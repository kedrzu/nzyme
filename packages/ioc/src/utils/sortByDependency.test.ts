import { describe, expect, test } from 'vitest';

import { defineService } from '../Service.js';
import { sortByDependency } from './sortByDependency.js';

describe('sortByDependency', () => {
    test('should sort services with no dependencies', () => {
        const serviceA = defineService({
            name: 'A',
            setup: () => 'A',
        });

        const serviceB = defineService({
            name: 'B',
            setup: () => 'B',
        });

        const result = sortByDependency([serviceB, serviceA]);
        expect(result).toEqual([serviceB, serviceA]);
    });

    test('should sort services with simple dependency chain', () => {
        const serviceA = defineService({
            name: 'A',
            setup: () => 'A',
        });

        const serviceB = defineService({
            name: 'B',
            deps: { a: serviceA },
            setup: () => 'B',
        });

        const serviceC = defineService({
            name: 'C',
            deps: { b: serviceB },
            setup: () => 'C',
        });

        // Test different input orders
        const result1 = sortByDependency([serviceC, serviceB, serviceA]);
        const result2 = sortByDependency([serviceA, serviceC, serviceB]);

        // A should come first, then B, then C
        expect(result1).toEqual([serviceA, serviceB, serviceC]);
        expect(result2).toEqual([serviceA, serviceB, serviceC]);
    });

    test('should sort services with complex dependency graph', () => {
        const serviceA = defineService({
            name: 'A',
            setup: () => 'A',
        });

        const serviceB = defineService({
            name: 'B',
            setup: () => 'B',
        });

        const serviceC = defineService({
            name: 'C',
            deps: { a: serviceA, b: serviceB },
            setup: () => 'C',
        });

        const serviceD = defineService({
            name: 'D',
            deps: { c: serviceC },
            setup: () => 'D',
        });

        const result = sortByDependency([serviceD, serviceC, serviceB, serviceA]);

        // A and B should come first (order between them doesn't matter)
        // C should come after both A and B
        // D should come last
        const aIndex = result.indexOf(serviceA);
        const bIndex = result.indexOf(serviceB);
        const cIndex = result.indexOf(serviceC);
        const dIndex = result.indexOf(serviceD);

        expect(aIndex).toBeLessThan(cIndex);
        expect(bIndex).toBeLessThan(cIndex);
        expect(cIndex).toBeLessThan(dIndex);
    });

    test('should detect circular dependencies', () => {
        const serviceA = defineService({
            name: 'A',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            deps: {} as any, // Will be set after serviceB is created
            setup: () => 'A',
        });

        const serviceB = defineService({
            name: 'B',
            deps: { a: serviceA },
            setup: () => 'B',
        });

        // Create circular dependency
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (serviceA as any).deps = { b: serviceB };

        expect(() => {
            sortByDependency([serviceA, serviceB]);
        }).toThrow('Circular dependency detected involving service: A');
    });

    test('should handle empty array', () => {
        const result = sortByDependency([]);
        expect(result).toEqual([]);
    });

    test('should handle single service', () => {
        const service = defineService({
            name: 'single',
            setup: () => 'single',
        });

        const result = sortByDependency([service]);
        expect(result).toEqual([service]);
    });
});
