import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Resolves a relative import specifier to the source file on disk it refers to.
 *
 * Needed because this repo imports `.ts` modules with a `.js` extension (an ESM requirement), so the
 * specifier as written names a file that does not exist until the package is built — the `.js` has
 * to be mapped back to source first. Mirrors `resolveRelativeImport` in the repo's
 * `analyzeImportGraph.ts`: candidate paths and a stat, no bundler resolution and no parser.
 *
 * Returns `undefined` for a bare specifier, which is deliberately out of scope — see
 * `noUnusedNoSideEffectsResult`.
 */
export function resolveImportSpecifier(fromFile: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
        return undefined;
    }

    const target = resolve(dirname(fromFile), specifier);
    const candidates: string[] = [];

    if (target.endsWith('.js')) {
        const stem = target.slice(0, -'.js'.length);
        candidates.push(`${stem}.ts`, `${stem}.tsx`);
    }

    candidates.push(target, `${target}.ts`, join(target, 'index.ts'));

    return candidates.find(isFile);
}

function isFile(path: string): boolean {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
