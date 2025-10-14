import type { Service } from '../Service.js';
import { getAllDeps } from './getAllDeps.js';

/**
 * Sorts an array of services by dependency using topological sort.
 * Services with no dependencies come first, followed by their dependents.
 * @__NO_SIDE_EFFECTS__
 */
export function sortByDependency<S extends Service>(services: S[]): S[] {
    if (services.length <= 1) {
        return [...services];
    }

    // Create a map for faster lookups
    const serviceSet = new Set(services);
    const result: S[] = [];
    const visited = new Set<S>();
    const visiting = new Set<S>();

    /**
     * Performs depth-first search to build topologically sorted order.
     * Dependencies are visited first, then the service itself is added to result.
     */
    function visit(service: S): void {
        if (visited.has(service)) {
            return;
        }

        if (visiting.has(service)) {
            throw new Error(`Circular dependency detected involving service: ${service.name}`);
        }

        visiting.add(service);

        // Get all dependencies of this service
        const deps = getAllDeps(service);

        // Visit dependencies that are in our services array first
        for (const dep of deps) {
            if (serviceSet.has(dep as S)) {
                visit(dep as S);
            }
        }

        visiting.delete(service);
        visited.add(service);
        result.push(service);
    }

    // Visit all services
    for (const service of services) {
        visit(service);
    }

    return result;
}
