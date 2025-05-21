import type { Injectable } from '../Injectable.js';
import { isService } from '../Service.js';
import type { Service } from '../Service.js';

const depsCacheSymbol = Symbol('ioc:deps');

type ServiceWithDeps = Service & {
    [depsCacheSymbol]?: Set<Injectable>;
};

/**
 * Returns a set of all direct and nested dependencies of a service.
 */
export function getAllDeps(service: Service): ReadonlySet<Injectable> {
    let deps = (service as ServiceWithDeps)[depsCacheSymbol];

    if (deps) {
        return deps;
    }

    deps = new Set<Injectable>();
    (service as ServiceWithDeps)[depsCacheSymbol] = deps;

    for (const dep of Object.values(service.deps)) {
        deps.add(dep);
        if (isService(dep)) {
            const nestedDeps = getAllDeps(dep);
            for (const nestedDep of nestedDeps) {
                deps.add(nestedDep);
            }
        }
    }

    deps = Object.freeze(deps);
    return deps;
}
