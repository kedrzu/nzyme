import type { Container } from '../Container.js';
import type { Injectable } from '../Injectable.js';
import type { ServiceDependencies } from '../Service.js';

/**
 * Resolves the dependencies of a service.
 * @param deps - The dependencies to resolve.
 * @param container - The container to resolve the dependencies from.
 * @param caller - The caller of the service.
 * @returns The resolved dependencies.
 */
export function resolveDeps(deps: ServiceDependencies, container: Container, caller?: Injectable) {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(deps)) {
        resolved[key] = value.resolve(container, caller);
    }

    return resolved;
}
