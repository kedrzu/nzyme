import { dirname, join, resolve } from 'node:path';

import { createFileCache } from './createFileCache.js';
import { isFile } from './isFile.js';

/** The `exports` condition a workspace package points at its TypeScript source with. */
const SOURCE_CONDITION = 'source';

const SCOPED_PACKAGE = /^(@[^/]+\/[^/]+)(\/.*)?$/;
const UNSCOPED_PACKAGE = /^([^/]+)(\/.*)?$/;

const readManifest = createFileCache<unknown>(source => JSON.parse(source));

/**
 * Resolves a bare specifier (`@nzyme/ioc/Service.js`) to the TypeScript source file of a workspace
 * package, through the `source` condition of the package's `exports`.
 *
 * The package is found the way Node finds it — `node_modules/<name>` in each directory up from the
 * importing file — so a workspace symlink leads to the package's own directory. Only the `source`
 * condition is followed: a package published without one (`zod`, `chalk`) has no source here to
 * read an annotation from, and is out of scope by returning `undefined`.
 */
export function resolvePackageSpecifier(fromFile: string, specifier: string): string | undefined {
    const match = SCOPED_PACKAGE.exec(specifier) ?? UNSCOPED_PACKAGE.exec(specifier);
    const name = match?.[1];
    if (name == null || specifier.startsWith('.') || specifier.startsWith('node:')) {
        return undefined;
    }

    const manifestFile = findManifest(dirname(fromFile), name);
    if (manifestFile == null) {
        return undefined;
    }

    const manifest = readManifest(manifestFile);
    const target = findSourceTarget(isRecord(manifest) ? manifest.exports : undefined, `.${match?.[2] ?? ''}`);
    if (target == null) {
        return undefined;
    }

    const file = resolve(dirname(manifestFile), target);
    return isFile(file) ? file : undefined;
}

function findManifest(fromDirectory: string, name: string): string | undefined {
    for (let directory = fromDirectory; ; directory = dirname(directory)) {
        const candidate = join(directory, 'node_modules', name, 'package.json');
        if (isFile(candidate)) {
            return candidate;
        }

        if (dirname(directory) === directory) {
            return undefined;
        }
    }
}

/**
 * The `source` target `subpath` maps to: an exact `exports` key first, then a `./*.js`-style pattern,
 * whose single `*` is substituted into the target as Node does it.
 */
function findSourceTarget(exports: unknown, subpath: string): string | undefined {
    if (!isRecord(exports)) {
        return undefined;
    }

    const exact = exports[subpath];
    if (exact !== undefined) {
        return readSourceCondition(exact);
    }

    for (const [key, value] of Object.entries(exports)) {
        const star = key.indexOf('*');
        if (star < 0) {
            continue;
        }

        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (subpath.length < key.length - 1 || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) {
            continue;
        }

        const target = readSourceCondition(value);
        if (target != null) {
            return target.replace('*', subpath.slice(prefix.length, subpath.length - suffix.length));
        }
    }

    return undefined;
}

function readSourceCondition(entry: unknown): string | undefined {
    if (!isRecord(entry)) {
        return undefined;
    }

    const source = entry[SOURCE_CONDITION];
    return typeof source === 'string' ? source : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
