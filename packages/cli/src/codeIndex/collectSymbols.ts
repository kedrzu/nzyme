import { access, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import type { Package } from '@nzyme/project-utils/getPackages.js';
import { forEachParalell } from '@nzyme/utils/array/forEachParalell.js';
import * as ts from 'typescript';

import { collectIndexSourceFiles } from './collectIndexSourceFiles.js';
import { extractComponent } from './extractComponent.js';
import { extractDefineSymbol } from './extractDefineSymbol.js';
import { extractEntity } from './extractEntity.js';
import { extractUtil } from './extractUtil.js';
import { importPathOf } from './importPathOf.js';
import type { DefineSymbolKind, IndexSettings } from './IndexSettings.js';
import type { IndexSymbol } from './IndexSymbol.js';

/** Inputs for {@link collectSymbols}. */
export interface CollectSymbolsOptions {
    /** Repo root — `IndexSymbol.relPath` is reported relative to it. */
    root: string;
    /** All workspace packages (from `getPackages`). */
    packages: readonly Package[];
    /** What to index beyond the generic kinds — from `getIndexSettings`. */
    settings: IndexSettings;
    /** Optional sink for non-fatal per-file warnings (a file that failed to read/parse). */
    onWarn?: (message: string) => void;
}

/** Candidate Nuxt config file names; any one present marks a package as a Nuxt app. */
const NUXT_CONFIG_FILES = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs', 'nuxt.config.cjs'];

/** Options for the per-file extractor. */
interface ExtractFromFileOptions {
    filePath: string;
    packageName: string;
    packageDir: string;
    root: string;
    /** Whether the owning package is a Nuxt app — its `.vue` files are skipped (component noise). */
    isNuxtApp: boolean;
    /** What to look for in the files of this package. */
    matchers: FileMatchers;
    onWarn?: (message: string) => void;
}

/** The settings boiled down to what the per-file extraction checks, computed once per crawl. */
interface FileMatchers {
    /**
     * Cheap string markers; a `.ts`/`.tsx` file is parsed only when it contains at least one: the
     * `defineX` callees, `@util`, and the table functions, so files that carry only a `@util` helper
     * or an entity (and no `defineX` call) still get parsed.
     */
    markers: readonly string[];
    /** Callee identifier text → its `defineX` kind, for O(1) matching. */
    kindsByCallee: ReadonlyMap<string, DefineSymbolKind>;
    /** Table functions whose calls are entities in this package; empty when it has none. */
    tableFunctions: ReadonlySet<string>;
}

/**
 * Walks every workspace package's source tree and extracts all indexable symbols into one flat
 * array. Per package: resolve the scan dir (`src/` for the library layout, else the package root
 * for the root layout Nuxt apps use — see {@link resolveScanDir}), collect source files, then for
 * each file read its content, apply a cheap string prefilter (skip unless it contains a known DSL
 * marker), parse only the survivors, and run the extractors.
 *
 * Packages are processed with bounded concurrency. `forEachParalell` is fail-fast, so each file's
 * read/parse/extract is wrapped in try/catch: a single unreadable or unparseable file is skipped
 * (optionally reported via `onWarn`) rather than aborting the whole crawl. Results are returned in
 * discovery order — rendering owns sorting.
 */
export async function collectSymbols(options: CollectSymbolsOptions): Promise<IndexSymbol[]> {
    const { root, packages, settings, onWarn } = options;

    const kindsByCallee = new Map(settings.defineKinds.map(kind => [kind.callee, kind]));
    const tableFunctions = settings.entities?.tableFunctions ?? new Set<string>();
    const markers = [...kindsByCallee.keys(), '@util', ...tableFunctions];
    const noTableFunctions = new Set<string>();

    const symbols: IndexSymbol[] = [];

    await forEachParalell(packages, {
        concurrency: 8,
        callback: async pkg => {
            const packageName = pkg.packageJson.name;
            if (!packageName) {
                return;
            }

            const packageDir = pkg.path;
            const [scanDir, isNuxtApp] = await Promise.all([resolveScanDir(packageDir), isNuxtAppPackage(packageDir)]);
            const files = await collectIndexSourceFiles(scanDir);
            const matchers: FileMatchers = {
                markers,
                kindsByCallee,
                tableFunctions: hasEntities(settings, packageName) ? tableFunctions : noTableFunctions,
            };

            for (const filePath of files) {
                const fileSymbols = await extractFromFile({
                    filePath,
                    packageName,
                    packageDir,
                    root,
                    isNuxtApp,
                    matchers,
                    onWarn,
                });
                for (const symbol of fileSymbols) {
                    symbols.push(symbol);
                }
            }
        },
    });

    return symbols;
}

/** Read, prefilter, parse, and extract one file — never throws (errors become warnings + []). */
async function extractFromFile(options: ExtractFromFileOptions): Promise<IndexSymbol[]> {
    const { filePath, packageName, packageDir, root, isNuxtApp, matchers, onWarn } = options;

    try {
        const content = await readFile(filePath, 'utf8');
        const importPath = importPathOf({ packageName, packageDir, filePath });
        const relPath = relative(root, filePath);

        // `.vue` single-file components: regex-only, no TS parse. Skipped entirely for Nuxt apps,
        // whose page/layout components would be indexing noise.
        if (filePath.endsWith('.vue')) {
            if (isNuxtApp) {
                return [];
            }
            return extractComponent({ packageName, relPath, importPath, fileName: basename(filePath), content });
        }

        // `.ts`/`.tsx`: cheap string prefilter, then parse only survivors and run the TS extractors.
        if (!matchers.markers.some(marker => content.includes(marker))) {
            return [];
        }

        const sourceFile = createSourceFile(filePath, content);

        const symbols = [
            ...extractDefineSymbol({
                sourceFile,
                packageName,
                relPath,
                importPath,
                kindsByCallee: matchers.kindsByCallee,
            }),
            ...extractUtil({ sourceFile, packageName, relPath, importPath }),
        ];

        // Entities are a database concept; only the configured packages' table calls are indexed.
        if (matchers.tableFunctions.size > 0) {
            symbols.push(
                ...extractEntity({
                    sourceFile,
                    packageName,
                    relPath,
                    importPath,
                    tableFunctions: matchers.tableFunctions,
                }),
            );
        }

        return symbols;
    } catch (error) {
        onWarn?.(`Failed to index ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/** True when the settings index entities and the package is one they are indexed in. */
function hasEntities(settings: IndexSettings, packageName: string): boolean {
    const { entities } = settings;
    return entities !== null && (entities.packages === null || entities.packages.has(packageName));
}

/**
 * The directory to scan for a package's source. Libraries keep code under `src/`; Nuxt apps and a
 * few root-layout packages keep it at the package root
 * (`services/`, `stores/`, `agents/`, …). Returns `src/` when it exists, else the package root —
 * so root-layout packages' `defineService`/`defineCommand`/etc. symbols are indexed too. (Build/dep
 * dirs like `.nuxt`/`.output`/`node_modules`/`dist` are excluded by the walker regardless.)
 */
async function resolveScanDir(packageDir: string): Promise<string> {
    const srcDir = join(packageDir, 'src');
    try {
        await access(srcDir);
        return srcDir;
    } catch {
        return packageDir;
    }
}

/** True when the package directory contains a Nuxt config file (i.e. the package is a Nuxt app). */
async function isNuxtAppPackage(packageDir: string): Promise<boolean> {
    for (const configFile of NUXT_CONFIG_FILES) {
        try {
            await access(join(packageDir, configFile));
            return true;
        } catch {
            // Not this config file — try the next candidate.
        }
    }
    return false;
}

/** Parses a file into a `ts.SourceFile` with parent pointers set (extractors need them). */
function createSourceFile(filePath: string, content: string): ts.SourceFile {
    return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, /* setParentNodes */ true);
}
