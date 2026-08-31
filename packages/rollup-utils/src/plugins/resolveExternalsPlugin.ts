import * as fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import * as path from 'node:path';

import type { PackageJson } from 'pkg-types';
import type { Plugin } from 'rollup';

interface ExportsConditions {
    [key: string]: string | ExportsConditions;
}

type ExportsEntry = string | ExportsConditions;

interface ResolvedPackage {
    dir: string;
    json: PackageJson;
}

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
                return undefined;
            }

            // Already a resolved node_modules path — just mark external
            if (source.includes('/node_modules/')) {
                return { id: source, external: true };
            }

            if (!importer) {
                return undefined;
            }

            // Parse the bare specifier into package name and subpath
            const { pkgName, subpath } = parsePackageSpecifier(source);

            // Find the package and resolve the entry point
            const pkg = findPackage(pkgName, importer);

            if (!pkg || !pkg.dir.includes('/node_modules/')) {
                return undefined;
            }

            const resolved = resolveEntry(pkg, subpath);

            if (!resolved) {
                return undefined;
            }

            return { id: resolved, external: true };
        },
    };
}

function findPackage(pkgName: string, importer: string): ResolvedPackage | null {
    try {
        const req = createRequire(importer);
        const pkgJsonPath = req.resolve(pkgName + '/package.json');
        const dir = path.dirname(pkgJsonPath);
        const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as PackageJson;
        return { dir, json };
    } catch {
        // package.json not exported — try resolving any entry to find the package
        try {
            const req = createRequire(importer);
            const resolved = req.resolve(pkgName);
            // Walk up to find the package.json
            let dir = path.dirname(resolved);
            while (dir !== path.dirname(dir)) {
                const pkgJsonPath = path.join(dir, 'package.json');
                if (fs.existsSync(pkgJsonPath)) {
                    const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as PackageJson;
                    if (json.name === pkgName) {
                        return { dir, json };
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

function resolveEntry(pkg: ResolvedPackage, subpath: string): string | null {
    // Try exports map first — most reliable for modern packages
    const exportsEntry = resolveExportsEntry(pkg.json, subpath);
    if (exportsEntry) {
        return path.join(pkg.dir, exportsEntry);
    }

    // For root entry without exports map, prefer module (ESM) over main (CJS).
    // Only use `module` when it's Node-compatible ESM: the package declares
    // `type: "module"` or the entry is an .mjs file. Otherwise `module` may
    // point to bundler-only ESM with extensionless imports (e.g., @aws-sdk).
    if (subpath === '.') {
        if (pkg.json.module && isNodeEsm(pkg.json)) {
            return path.join(pkg.dir, pkg.json.module);
        }
        if (pkg.json.main) {
            return path.join(pkg.dir, pkg.json.main);
        }
    }

    // Last resort: use createRequire to resolve
    try {
        const pkgJsonPath = path.join(pkg.dir, 'package.json');
        const req = createRequire(pkgJsonPath);
        const source = pkg.json.name! + (subpath === '.' ? '' : '/' + subpath.slice(2));
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
