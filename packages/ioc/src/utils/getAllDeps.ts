import type { Injectable } from '../Injectable.js';

const depsCacheSymbol = Symbol('ioc:deps');

type InjectableWithDeps = Injectable & {
    [depsCacheSymbol]?: Set<Injectable>;
};

/**
 * Returns a set of all direct and nested dependencies of a service.
 */
export function getAllDeps(injectable: Injectable): ReadonlySet<Injectable> {
    let deps = (injectable as InjectableWithDeps)[depsCacheSymbol];

    if (deps) {
        return deps;
    }

    deps = new Set<Injectable>();
    (injectable as InjectableWithDeps)[depsCacheSymbol] = deps;

    if (!injectable.deps) {
        return deps;
    }

    for (const dep of Object.values(injectable.deps)) {
        deps.add(dep);
        const nestedDeps = getAllDeps(dep);
        for (const nestedDep of nestedDeps) {
            deps.add(nestedDep);
        }
    }

    deps = Object.freeze(deps);
    return deps;
}
