import { statSync } from 'node:fs';
import path from 'node:path';

import { assertNever } from '@nzyme/utils/assertNever.js';

import { findOwningPackageDir } from '../findOwningPackageDir.js';
import type { Package } from '../getPackages.js';
import { isFileIgnored } from '../isFileIgnored.js';
import { relativePosixPath } from '../relativePosixPath.js';
import { getImportSourceKind } from './extractImportSpecifiers.js';
import type { ImportSpecifier } from './extractImportSpecifiers.js';

/**
 * A path alias valid inside the listed packages: `{ prefix: '@/', packages: ['@acme/app'] }` makes
 * `@/x` in a file of `@acme/app` mean `<root of @acme/app>/x`.
 */
export interface ImportAlias {
    prefix: string;
    /** Names of the packages whose files may use the alias. */
    packages: string[];
}

/** Options of {@link createImportResolver}. */
export interface CreateImportResolverOptions {
    /** Absolute project root; `packages` paths are made relative to it. */
    root: string;
    packages: Package[];
    aliases?: ImportAlias[];
    /**
     * The paths an import resolves to first, root-relative and `/`-separated. A `module` or `sass`
     * target outside it is still found on disk when it is a gitignored source file outside any
     * gitignored directory — see {@link createImportResolver}.
     */
    paths: ReadonlySet<string>;
}

/** Resolves specifiers found in a root-relative file to root-relative paths. */
export interface ImportResolver {
    /**
     * Targets of the specifier — one path, every path under a directory (`url` kind), or none
     * (external package, virtual module like `#app`, subpath outside the package `exports`).
     */
    resolve(fromFile: string, specifier: ImportSpecifier): string[];
}

/**
 * Resolves a relative module specifier against a set of paths the way TypeScript resolves an ESM
 * import: `.js`/`.ts`/`.tsx` stripped, then `.ts`, `.tsx`, `index.ts`, `index.tsx`. Works with
 * absolute or root-relative paths alike — `fromFile` and `pathSet` only have to agree.
 * {@link createImportResolver} tries more candidates on top (non-TS files, `.jsx`, `.mjs`).
 * @__NO_SIDE_EFFECTS__
 */
export function resolveRelativeSpecifier(
    fromFile: string,
    specifier: string,
    pathSet: ReadonlySet<string>,
): string | null {
    const candidates = typeScriptCandidates(joinPath(path.posix.dirname(fromFile), specifier));
    return candidates.find(candidate => pathSet.has(candidate)) ?? null;
}

/**
 * Creates the resolver of an import graph: relative specifiers, workspace packages through their
 * `exports` (the `source` condition, else a plain target, `import` or `default`; `*` patterns),
 * aliases, Sass partials and `new URL` file/directory targets. A specifier that resolves to nothing
 * yields no target rather than an error.
 *
 * Every candidate is looked up in `paths` first. Only when none is there does a `module`/`sass`
 * specifier fall back to disk, and only to a generated source file: a source extension
 * (`.ts .tsx .mts .js .mjs .vue .scss`), inside the root, outside `node_modules`, and not in a
 * gitignored directory — so a gitignored `x.loc.ts` next to its sources is found, while build
 * output (`dist/`, `.nuxt/`) never is, not even through a package's `import`/`default` export.
 * `url` targets come from `paths` only.
 */
export function createImportResolver(options: CreateImportResolverOptions): ImportResolver {
    const { root, paths } = options;
    const packages = options.packages.map(pkg => ({
        name: pkg.packageJson.name,
        root: relativePosixPath(root, pkg.path),
        exports: pkg.packageJson.exports,
    }));
    const packagesByName = new Map(packages.flatMap(pkg => (pkg.name ? [[pkg.name, pkg] as const] : [])));
    const packagesByRoot = new Map<string, (typeof packages)[number]>();
    for (const pkg of packages) {
        if (!packagesByRoot.has(pkg.root)) {
            packagesByRoot.set(pkg.root, pkg);
        }
    }
    const packageRoots = [...packagesByRoot.keys()];
    const aliases = options.aliases ?? [];
    let sortedPaths: string[] | undefined;
    const onDisk = new Map<string, boolean>();

    return { resolve };

    function resolve(fromFile: string, { specifier, kind }: ImportSpecifier): string[] {
        switch (kind) {
            case 'module':
                return toList(resolveModule(fromFile, specifier));
            case 'sass':
                return toList(resolveSass(fromFile, specifier));
            case 'url':
                return resolveUrl(fromFile, specifier);
            default:
                return assertNever(kind);
        }
    }

    function resolveModule(fromFile: string, rawSpecifier: string): string | null {
        if (rawSpecifier.startsWith('#') || hasUrlScheme(rawSpecifier)) {
            return null;
        }
        // A bundler query (`x.svg?component`, `sw.js?worker&url`) does not change the file.
        const specifier = rawSpecifier.replace(/\?.*$/, '');
        if (specifier.startsWith('.')) {
            return findCandidate(moduleCandidates(joinPath(path.posix.dirname(fromFile), specifier)));
        }
        if (specifier.startsWith('/')) {
            return null;
        }

        const owner = ownerOf(fromFile);
        for (const alias of aliases) {
            if (owner?.name && alias.packages.includes(owner.name) && specifier.startsWith(alias.prefix)) {
                return findCandidate(moduleCandidates(joinPath(owner.root, specifier.slice(alias.prefix.length))));
            }
        }

        return resolvePackageExport(specifier);
    }

    function resolveSass(fromFile: string, specifier: string): string | null {
        if (hasUrlScheme(specifier) || specifier.startsWith('/')) {
            return null;
        }
        const relative = resolveSassPath(joinPath(path.posix.dirname(fromFile), specifier));
        if (relative || specifier.startsWith('.')) {
            return relative;
        }

        const owner = ownerOf(fromFile);
        for (const alias of aliases) {
            if (owner?.name && alias.packages.includes(owner.name) && specifier.startsWith(alias.prefix)) {
                return resolveSassPath(joinPath(owner.root, specifier.slice(alias.prefix.length)));
            }
        }

        return resolvePackageExport(specifier);
    }

    function resolveSassPath(base: string): string | null {
        const partial = path.posix.join(path.posix.dirname(base), `_${path.posix.basename(base)}`);
        const candidates = /\.(s[ac]ss|css)$/.test(base)
            ? [base, partial]
            : [
                  `${base}.scss`,
                  `${partial}.scss`,
                  `${base}.sass`,
                  `${partial}.sass`,
                  `${base}.css`,
                  `${base}/_index.scss`,
                  `${base}/index.scss`,
              ];
        return findCandidate(candidates);
    }

    function resolveUrl(fromFile: string, specifier: string): string[] {
        if (hasUrlScheme(specifier) || specifier.startsWith('/')) {
            return [];
        }
        const target = joinPath(path.posix.dirname(fromFile), specifier);
        if (paths.has(target)) {
            return [target];
        }

        const prefix = target === '.' ? '' : `${target}/`;
        sortedPaths ??= [...paths].toSorted();
        return sortedPaths.filter(candidate => candidate.startsWith(prefix) && !candidate.startsWith('../'));
    }

    function resolvePackageExport(specifier: string): string | null {
        const segments = specifier.split('/');
        const nameLength = specifier.startsWith('@') ? 2 : 1;
        const pkg = packagesByName.get(segments.slice(0, nameLength).join('/'));
        if (!pkg) {
            return null;
        }

        const subpath = segments.length > nameLength ? `./${segments.slice(nameLength).join('/')}` : '.';
        const target = matchExport(pkg.exports, subpath);
        if (target === null) {
            return null;
        }

        return findCandidate([joinPath(pkg.root, target)]);
    }

    function findCandidate(candidates: string[]): string | null {
        return (
            candidates.find(candidate => paths.has(candidate)) ??
            candidates.find(candidate => isGeneratedSourceOnDisk(candidate)) ??
            null
        );
    }

    function isGeneratedSourceOnDisk(candidate: string): boolean {
        const cached = onDisk.get(candidate);
        if (cached !== undefined) {
            return cached;
        }

        const dir = path.posix.dirname(candidate);
        const found =
            getImportSourceKind(candidate) !== null &&
            !candidate.startsWith('../') &&
            !candidate.split('/').includes('node_modules') &&
            isFileOnDisk(path.join(root, candidate)) &&
            (dir === '.' || isFileIgnored(path.join(root, dir)) !== true);
        onDisk.set(candidate, found);
        return found;
    }

    function ownerOf(file: string) {
        return packagesByRoot.get(findOwningPackageDir(file, packageRoots));
    }
}

/** {@link typeScriptCandidates} first, then the path as written and the non-TS forms. */
function moduleCandidates(joined: string): string[] {
    const base = joined.replace(/\.(js|ts|tsx)$/, '');
    return [
        ...typeScriptCandidates(joined),
        joined,
        joined.replace(/\.jsx$/, '.tsx'),
        joined.replace(/\.mjs$/, '.mts'),
        `${base}.js`,
        `${base}.d.ts`,
        `${base}/index.js`,
    ];
}

function typeScriptCandidates(joined: string): string[] {
    const base = joined.replace(/\.(js|ts|tsx)$/, '');
    return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
}

function isFileOnDisk(file: string): boolean {
    try {
        return statSync(file).isFile();
    } catch {
        return false;
    }
}

/**
 * The target of a subpath in `package.json` `exports`, `./`-relative to the package, with `*`
 * substituted; `null` when the subpath is not exported. A pattern key matches like Node's: the
 * longest prefix before `*` wins.
 */
function matchExport(exports: unknown, subpath: string): string | null {
    if (exports === null || exports === undefined) {
        return null;
    }
    if (typeof exports === 'string' || Array.isArray(exports) || !isRecord(exports)) {
        return subpath === '.' ? pickTarget(exports) : null;
    }

    const keys = Object.keys(exports);
    if (!keys.some(key => key.startsWith('.'))) {
        // A conditions object at the top level exports `.` only.
        return subpath === '.' ? pickTarget(exports) : null;
    }

    if (Object.hasOwn(exports, subpath) && !subpath.includes('*')) {
        return pickTarget(exports[subpath]);
    }

    let best: { key: string; prefix: string; captured: string } | undefined;
    for (const key of keys) {
        const star = key.indexOf('*');
        if (star === -1 || key.includes('*', star + 1)) {
            continue;
        }
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (subpath.length < key.length - 1 || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) {
            continue;
        }
        if (
            !best ||
            prefix.length > best.prefix.length ||
            (prefix.length === best.prefix.length && key.length > best.key.length)
        ) {
            best = { key, prefix, captured: subpath.slice(prefix.length, subpath.length - suffix.length) };
        }
    }
    if (!best) {
        return null;
    }

    const target = pickTarget(exports[best.key]);
    return target === null ? null : target.replaceAll('*', best.captured);
}

/** Picks the source file an export entry points at: `source`, else a plain target, `import`, `default`. */
function pickTarget(entry: unknown): string | null {
    if (typeof entry === 'string') {
        return entry;
    }
    if (Array.isArray(entry)) {
        for (const item of entry) {
            const target = pickTarget(item);
            if (target !== null) {
                return target;
            }
        }
        return null;
    }
    if (!isRecord(entry)) {
        return null;
    }
    for (const condition of ['source', 'import', 'default']) {
        if (Object.hasOwn(entry, condition)) {
            return pickTarget(entry[condition]);
        }
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** `path.posix.join` without the trailing slash, so `'../'` and `'..'` resolve alike (as `path.resolve` does). */
function joinPath(dir: string, specifier: string): string {
    const joined = path.posix.join(dir, specifier);
    return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

function hasUrlScheme(specifier: string): boolean {
    return /^[a-z][\d+.a-z-]*:/i.test(specifier);
}

function toList(target: string | null): string[] {
    return target === null ? [] : [target];
}
