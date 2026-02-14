import { dirname } from 'node:path';

import { resolveModulePath } from './resolveModulePath.js';

/**
 *
 */
export function resolveProjectPath(project: string, meta?: ImportMeta) {
    const module = `${project}/package.json`;
    const modulePath = resolveModulePath(module, meta);

    return dirname(modulePath);
}
