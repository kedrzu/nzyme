import type { Service } from '../Service.js';
import { getAllDeps } from './getAllDeps.js';

/**
 * Sorts an array of services by dependency.
 */
export function sortByDependency<S extends Service>(services: S[]): S[] {
    return services.sort((a, b) => {
        const aDeps = getAllDeps(a);
        const bDeps = getAllDeps(b);

        if (aDeps.has(b)) {
            return 1;
        }

        if (bDeps.has(a)) {
            return -1;
        }

        return 0;
    });
}
