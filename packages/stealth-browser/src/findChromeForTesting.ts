import { existsSync } from 'node:fs';
import path from 'node:path';

import { getChromeForTestingFolder, getChromeForTestingRelease } from './getChromeForTestingRelease.js';

/** Where to look for an installed Chrome for Testing. */
export interface FindChromeForTestingOptions {
    /** The folder `installChromeForTesting` installs into. */
    cacheDir: string;
    /** The pinned version by default. */
    version?: string;
}

/**
 * The executable of a fully installed Chrome for Testing in `cacheDir`, or `null`; never downloads. Throws on a
 * platform no build is pinned for.
 */
export function findChromeForTesting(options: FindChromeForTestingOptions): string | null {
    const release = getChromeForTestingRelease(options.version);
    const executablePath = path.join(getChromeForTestingFolder(options.cacheDir, release), release.executable);
    return existsSync(executablePath) ? executablePath : null;
}
