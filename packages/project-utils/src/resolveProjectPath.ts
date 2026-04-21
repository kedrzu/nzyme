import { dirname } from 'node:path';

import { resolveModulePath } from './resolveModulePath.js';

/** Resolves the root directory of a project by locating its package.json. */
export function resolveProjectPath(project: string, meta?: ImportMeta) {
    const module = `${project}/package.json`;
    const modulePath = resolveModulePath(module, meta);

    return dirname(modulePath);
}
