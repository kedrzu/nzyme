import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { getMd5Hash } from '@nzyme/crypto';
import type { ImportGraph } from '@nzyme/project-utils/importGraph/buildImportGraph.js';
import type { ImportAlias, ImportResolver } from '@nzyme/project-utils/importGraph/resolveImportTarget.js';

import type { AffectedRewrite } from '../base/AffectedConfig.js';
import type { SuiteFingerprint, SuiteInput, SuiteInputRole } from '../store/VariantStore.js';
import { collectImportClosure } from './collectImportClosure.js';
import type { FileState } from './FileStates.js';
import { matchesFileHash, toFileHash } from './FileStates.js';
import { scanModuleEffects } from './scanModuleEffects.js';

/** The suite input that no longer matches: a file, or `package.json` when the selection config changed. */
export interface SuiteChange {
    file: string;
    role: SuiteInputRole | 'config';
}

/** Reads the current state of a root-relative file. */
export type ReadFileState = (file: string) => Promise<FileState | null>;

/** Options of {@link buildSuiteFingerprint}. */
export interface BuildSuiteFingerprintOptions {
    root: string;
    graph: ImportGraph;
    /** Resolves side-effect import specifiers to files. */
    resolver: ImportResolver;
    /** Hash of the selection config (see {@link getSuiteConfigHash}). */
    config: string;
    /** Root-relative globs of the full-run triggers, global and the suite's own (see {@link findTriggerFiles}). */
    triggers: string[];
    /** Files whose functions ran at startup. */
    startup: Iterable<string>;
    /** Files scanned for side-effect imports and computed dynamic imports: the test's files and `startup`. */
    scanned: Iterable<string>;
    readState: ReadFileState;
}

/** The outcome of {@link buildSuiteFingerprint}. */
export interface BuildSuiteFingerprintResult {
    suite: SuiteFingerprint;
    /** The scanned files with a computed `import(…)`, sorted. */
    computedDynamicImports: string[];
}

/**
 * Builds the suite fingerprint a recorded variant carries. Inputs, by role:
 * - `trigger` — the trigger files ({@link findTriggerFiles}) and everything they import, transitively;
 * - `startup` — files whose functions ran at startup;
 * - `side-effect` — modules a scanned file imports for side effects only (`import 'x'`);
 * - `dynamic-import` — scanned files with a computed `import(…)`, whose target nobody can tell.
 *
 * Every input is hashed in full; a file that is missing now is left out (the variant's own files
 * catch a missing file that matters). A file with several roles keeps the first in this order.
 */
export async function buildSuiteFingerprint(
    options: BuildSuiteFingerprintOptions,
): Promise<BuildSuiteFingerprintResult> {
    const { graph } = options;
    const roles = new Map<string, SuiteInputRole>();
    const computedDynamicImports: string[] = [];
    function add(file: string, role: SuiteInputRole) {
        if (!roles.has(file)) {
            roles.set(file, role);
        }
    }

    const triggerFiles = await findTriggerFiles(options.root, graph.files, options.triggers);
    for (const file of [...triggerFiles, ...collectImportClosure(graph, triggerFiles)]) {
        add(file, 'trigger');
    }
    for (const file of options.startup) {
        add(file, 'startup');
    }

    for (const file of new Set(options.scanned)) {
        const content = await readFile(path.join(options.root, file), 'utf8').catch(() => null);
        if (content === null) {
            continue;
        }
        const effects = scanModuleEffects(file, content);
        for (const specifier of effects.sideEffectImports) {
            for (const target of options.resolver.resolve(file, {
                specifier,
                typeOnly: false,
                dynamic: false,
                kind: 'module',
            })) {
                add(target, 'side-effect');
            }
        }
        if (effects.computedDynamicImport) {
            add(file, 'dynamic-import');
            computedDynamicImports.push(file);
        }
    }

    const inputs: Record<string, SuiteInput> = {};
    for (const file of [...roles.keys()].toSorted()) {
        const state = await options.readState(file);
        const role = roles.get(file);
        if (state && role) {
            inputs[file] = { role, hash: toFileHash(state, 'full') };
        }
    }

    return {
        suite: { hash: getMd5Hash(JSON.stringify([options.config, inputs])), config: options.config, inputs },
        computedDynamicImports: computedDynamicImports.toSorted(),
    };
}

/** Options of {@link findSuiteChange}. */
export interface FindSuiteChangeOptions {
    suite: SuiteFingerprint;
    /** Hash of the current selection config. */
    config: string;
    /** The trigger files now ({@link findTriggerFiles}). */
    triggerFiles: string[];
    readState: ReadFileState;
}

/**
 * The first input of a stored suite fingerprint that is no longer current, or `null` when all are:
 * a changed selection config, a trigger file that did not exist when it was recorded (a new
 * migration), then each input in path order.
 */
export async function findSuiteChange(options: FindSuiteChangeOptions): Promise<SuiteChange | null> {
    const { suite } = options;
    if (suite.config !== options.config) {
        return { file: 'package.json', role: 'config' };
    }

    for (const file of options.triggerFiles) {
        if (!Object.hasOwn(suite.inputs, file)) {
            return { file, role: 'trigger' };
        }
    }

    for (const [file, input] of Object.entries(suite.inputs).toSorted(([a], [b]) => (a < b ? -1 : 1))) {
        if (!matchesFileHash(input.hash, await options.readState(file))) {
            return { file, role: input.role };
        }
    }

    return null;
}

/**
 * The trigger files, sorted: the walked files matching a root-relative trigger glob, and each trigger
 * with no glob character that names an existing file — even one git ignores and the walk skips (an
 * install stamp under `node_modules/`).
 */
export async function findTriggerFiles(
    root: string,
    files: readonly string[],
    triggers: readonly string[],
): Promise<string[]> {
    const globs = triggers.map(trigger => new Bun.Glob(trigger));
    const found = new Set(files.filter(file => globs.some(glob => glob.match(file))));
    for (const trigger of triggers) {
        if (found.has(trigger) || /[*?[\]{}!\\]/.test(trigger)) {
            continue;
        }
        const stats = await stat(path.join(root, trigger)).catch(() => null);
        if (stats?.isFile()) {
            found.add(trigger);
        }
    }
    return [...found].toSorted();
}

/** Options of {@link getSuiteConfigHash}. */
export interface GetSuiteConfigHashOptions {
    triggers: string[];
    traced: boolean;
    aliases: ImportAlias[];
    rewrites: AffectedRewrite[];
}

/**
 * Hash of the config that decides what a variant depends on: the triggers, tracing, and the aliases
 * and rewrites the import graph resolves through. Changing any of it invalidates every variant of the suite.
 * @__NO_SIDE_EFFECTS__
 */
export function getSuiteConfigHash(options: GetSuiteConfigHashOptions): string {
    return getMd5Hash(JSON.stringify([options.triggers, options.traced, options.aliases, options.rewrites]));
}
