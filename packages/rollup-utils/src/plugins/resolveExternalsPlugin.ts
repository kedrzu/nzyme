import * as fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import * as path from 'node:path';

import type { PackageJson } from 'pkg-types';
import type { Plugin } from 'rollup';

interface ExportsConditions {
    [key: string]: string | ExportsConditions;
}

type ExportsEntry = string | ExportsConditions;

/**
 * Rollup plugin that resolves external npm packages to their full filesystem
 * paths. This makes the output self-contained and not dependent on runtime
 * Node module resolution. Node built-ins are kept as-is.
 */
export function resolveExternalsPlugin(): Plugin {
    return {
        name: 'resolve-externals',
        resolveId(source, importer) {
            // Built-ins stay as bare specifiers
            if (isBuiltin(source)) {
                if (source.startsWith('node:')) {
                    return { id: source.slice(5), external: true };
                }

                return { id: source, external: true };
            }

            // Relative imports — let Rollup handle them
            if (source.startsWith('.') || source.startsWith('/')) {
                return;
            }

            // Already a resolved node_modules path — just mark external
            if (source.includes('/node_modules/')) {
                return { id: source, external: true };
            }

            if (!importer) {
                return;
            }

            // Parse the bare specifier into package name and subpath
            const { pkgName, subpath } = parsePackageSpecifier(source);

            // Use createRequire to find the package directory from the importer's location
            const pkgDir = findPackageDir(pkgName, importer);

            if (!pkgDir || !pkgDir.includes('/node_modules/')) {
                return;
            }

            // Resolve to the ESM entry point
            const resolved = resolveEsmEntry(pkgDir, subpath);

            if (!resolved) {
                return;
            }

            return { id: resolved, external: true };
        },
    };
}

function findPackageDir(pkgName: string, importer: string): string | null {
    try {
        const req = createRequire(importer);
        const pkgJsonPath = req.resolve(pkgName + '/package.json');
        return path.dirname(pkgJsonPath);
    } catch {
        // package.json not exported — try resolving any entry to find the package
        try {
            const req = createRequire(importer);
            const resolved = req.resolve(pkgName);
            // Walk up to find the package.json
            let dir = path.dirname(resolved);
            while (dir !== path.dirname(dir)) {
                if (fs.existsSync(path.join(dir, 'package.json'))) {
                    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson;
                    if (pkg.name === pkgName) {
                        return dir;
                    }
                }
                dir = path.dirname(dir);
            }
        } catch {
            // Can't find the package at all
        }
        return null;
    }
}

function resolveEsmEntry(pkgDir: string, subpath: string): string | null {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as PackageJson;

    // Try exports map first — most reliable for modern packages
    const exportsEntry = resolveExportsEntry(pkgJson, subpath);
    if (exportsEntry) {
        return path.join(pkgDir, exportsEntry);
    }

    // For root entry without exports map, prefer module (ESM) over main (CJS).
    // Only use `module` when it's Node-compatible ESM: the package declares
    // `type: "module"` or the entry is an .mjs file. Otherwise `module` may
    // point to bundler-only ESM with extensionless imports (e.g., @aws-sdk).
    if (subpath === '.') {
        if (pkgJson.module && isNodeEsm(pkgJson)) {
            return path.join(pkgDir, pkgJson.module);
        }
        if (pkgJson.main) {
            return path.join(pkgDir, pkgJson.main);
        }
    }

    // Last resort: use createRequire to resolve
    try {
        const req = createRequire(pkgJsonPath);
        const source = pkgJson.name! + (subpath === '.' ? '' : '/' + subpath.slice(2));
        return req.resolve(source);
    } catch {
        return null;
    }
}

function parsePackageSpecifier(source: string): { pkgName: string; subpath: string } {
    if (source.startsWith('@')) {
        const parts = source.split('/');
        const pkgName = parts.slice(0, 2).join('/');
        const subpath = parts.length > 2 ? './' + parts.slice(2).join('/') : '.';
        return { pkgName, subpath };
    }

    const parts = source.split('/');
    const pkgName = parts[0]!;
    const subpath = parts.length > 1 ? './' + parts.slice(1).join('/') : '.';
    return { pkgName, subpath };
}

function isNodeEsm(pkgJson: PackageJson): boolean {
    return pkgJson.type === 'module' || (!!pkgJson.module && pkgJson.module.endsWith('.mjs'));
}

function resolveExportsEntry(pkgJson: PackageJson, subpath: string): string | null {
    const exports = pkgJson.exports;

    if (!exports) {
        return null;
    }

    // Handle string exports (shorthand for ".")
    if (typeof exports === 'string') {
        return subpath === '.' ? exports : null;
    }

    const entry = (exports as Record<string, ExportsEntry>)[subpath];

    if (!entry) {
        return null;
    }

    return resolveCondition(entry);
}

function resolveCondition(entry: ExportsEntry): string | null {
    if (typeof entry === 'string') {
        return entry;
    }

    // Prefer node > import > module > default
    if (entry.node) {
        return resolveCondition(entry.node);
    }

    if (entry.import) {
        return resolveCondition(entry.import);
    }

    if (entry.module) {
        return resolveCondition(entry.module);
    }

    if (entry.default) {
        return resolveCondition(entry.default);
    }

    return null;
}
