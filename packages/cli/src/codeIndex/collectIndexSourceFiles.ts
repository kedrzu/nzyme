import { basename, join } from 'node:path';

import { walkProjectFiles } from '@nzyme/project-utils/importGraph/walkProjectFiles.js';

/**
 * Recursively collects absolute paths of indexable source files under `dir`: `.ts`, `.tsx`,
 * and `.vue`. Excludes declaration files (`.d.ts`), test/story sources (`*.test.ts`,
 * `*.spec.ts`, `*.stories.tsx`/`*.stories.ts`) and everything git ignores — build output and
 * dependencies included (see `walkProjectFiles`). A missing/unreadable directory yields an empty
 * list rather than throwing, so a package without the expected layout is skipped gracefully.
 */
export async function collectIndexSourceFiles(dir: string): Promise<string[]> {
    const files = await walkProjectFiles(dir);
    return files.filter(file => isIndexableFile(basename(file))).map(file => join(dir, file));
}

/** True for a file we index: `.ts`/`.tsx`/`.vue`, minus declarations, tests, and stories. */
function isIndexableFile(name: string): boolean {
    if (name.endsWith('.d.ts')) {
        return false;
    }
    if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) {
        return false;
    }
    if (name.endsWith('.stories.ts') || name.endsWith('.stories.tsx')) {
        return false;
    }
    return name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.vue');
}
