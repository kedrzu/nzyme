import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';

import { resolveAppFile } from './resolveAppFile.js';
import type { TracedApp } from './TracedApp.js';

/** Parameters of {@link mapBrowserAssets}. */
export interface MapBrowserAssetsParams {
    /** URLs the browser fetched. */
    urls: Iterable<string>;
    apps: readonly TracedApp[];
    /** Absolute project root. */
    root: string;
}

/**
 * The static assets of the apps' source `public/` directories that the browser fetched, as
 * root-relative paths. A built bundle (`/assets/*.js`) is not one: it is not in `public/`, and the
 * code it was built from is reached through what ran and its imports.
 */
export function mapBrowserAssets(params: MapBrowserAssetsParams): string[] {
    const { urls, apps, root } = params;
    const assets = new Set<string>();
    for (const url of urls) {
        const file = resolveAppFile({ url, apps, root, dir: 'publicDir' });
        if (file !== undefined) {
            assets.add(relativePosixPath(root, file));
        }
    }
    return [...assets];
}
