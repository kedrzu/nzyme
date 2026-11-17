import { statSync } from 'node:fs';
import path from 'node:path';

import type { TracedApp } from './TracedApp.js';

/** Parameters of {@link resolveAppFile}. */
export interface ResolveAppFileParams {
    url: string;
    apps: readonly TracedApp[];
    /** Absolute project root. */
    root: string;
    /** Which directory of the app the URL path is looked up in. */
    dir: 'publicDir' | 'outputDir';
}

/**
 * The file under the app's `dir` that a URL of the app's origin names: the longest suffix of the URL
 * path naming an existing file there, so a path a server prefixes (Nuxt Image's
 * `/_ipx/w_390&f_avif/img/hero.jpg`) still finds `img/hero.jpg`. `undefined` for another origin or
 * when no suffix names a file.
 */
export function resolveAppFile(params: ResolveAppFileParams): string | undefined {
    const { url, apps, root, dir } = params;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }

    const app = apps.find(candidate => new URL(candidate.origin).origin === parsed.origin);
    if (app === undefined) {
        return undefined;
    }

    const base = path.resolve(root, app[dir]);
    let pathname: string;
    try {
        pathname = decodeURIComponent(parsed.pathname);
    } catch {
        return undefined;
    }
    const segments = pathname.split('/').filter(segment => segment !== '' && segment !== '.' && segment !== '..');
    for (let first = 0; first < segments.length; first++) {
        const file = path.join(base, ...segments.slice(first));
        if (statSync(file, { throwIfNoEntry: false })?.isFile()) {
            return file;
        }
    }
    return undefined;
}
