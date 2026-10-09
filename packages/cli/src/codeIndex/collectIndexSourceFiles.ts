import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Directories never worth scanning for source — build output, caches, deps. */
const IGNORED_DIRS = new Set([
    'node_modules',
    'dist',
    'dist-cjs',
    '.output',
    '.nuxt',
    '.nx',
    '.nzyme',
    '.rollup.cache',
    'coverage',
]);

/**
 * Recursively collects absolute paths of indexable source files under `dir`: `.ts`, `.tsx`,
 * and `.vue`. Excludes declaration files (`.d.ts`), test/story sources (`*.test.ts`,
 * `*.spec.ts`, `*.stories.tsx`/`*.stories.ts`), and never descends into build/dependency
 * directories or dot-directories. A missing/unreadable directory yields an empty list rather
 * than throwing, so a package without the expected layout is skipped gracefully.
 */
export async function collectIndexSourceFiles(dir: string): Promise<string[]> {
    const out: string[] = [];

    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
                continue;
            }
            out.push(...(await collectIndexSourceFiles(join(dir, entry.name))));
        } else if (isIndexableFile(entry.name)) {
            out.push(join(dir, entry.name));
        }
    }

    return out;
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
