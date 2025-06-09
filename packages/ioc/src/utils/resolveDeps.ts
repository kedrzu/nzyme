import type { Container } from '../Container.js';
import type { Injectable } from '../Injectable.js';
import type { Dependencies, ResolveDeps } from '../Service.js';

/**
 * Resolves the dependencies of a service.
 * @param deps - The dependencies to resolve.
 * @param container - The container to resolve the dependencies from.
 * @param caller - The caller of the service.
 * @returns The resolved dependencies.
 */
export function resolveDeps<TDeps extends Dependencies>(
    deps: TDeps,
    container: Container,
    caller?: Injectable,
): ResolveDeps<TDeps> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(deps)) {
        resolved[key] = value.resolve(container, caller);
    }

    return resolved as ResolveDeps<TDeps>;
}
