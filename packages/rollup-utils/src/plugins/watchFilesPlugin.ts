import type { Plugin } from 'rollup';

import { shouldWatch } from '../shouldWatch.js';

/**
 * Creates a Rollup plugin that watches files for changes.
 * Fixes the issue that Rollup does not watch files.
 *
 * @returns A Rollup plugin that watches files for changes
 *
 * @example
 * ```typescript
 * // In your Rollup config:
 * plugins: [watchFilesPlugin()]
 */
export function watchFilesPlugin(): Plugin {
    return {
        name: 'watch-files',
        transform(_code, id) {
            if (shouldWatch(id)) {
                this.addWatchFile(id);
            }
        },
    };
}
