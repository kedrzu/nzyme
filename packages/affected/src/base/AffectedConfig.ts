import { createConfigParsers } from '@nzyme/project-utils/createConfigParsers.js';
import type { ImportAlias } from '@nzyme/project-utils/importGraph/resolveImportTarget.js';
import { readNzymeConfig } from '@nzyme/project-utils/readNzymeConfig.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

const { parseArray, parseStringArray, parseString, configError } = createConfigParsers('affected');

/**
 * Configuration of `nzyme git affected` (`baseBranches` also of `nzyme git base`), read from the
 * `nzyme.affected` field of the repo's root `package.json`. Everything is optional;
 * {@link readAffectedConfig} fills in the defaults.
 *
 * `fullRunTriggers` and `ignore` are globs (`Bun.Glob`) always matched against the root-relative
 * path — unlike the command's selection patterns, a glob without `/` is NOT matched against the
 * basename. So `package.json` is the root manifest only (a package's own `package.json` is handled
 * separately: it stands for a change of every source file of that package), and a glob meant for
 * every directory says so: `**\/tsconfig*.json`. A source file a trigger file imports, transitively,
 * triggers too — list the roots (the test preload, a `.storybook/preview.ts`), not what they import.
 *
 * For the variants of `suites`, a trigger with no glob character names one root-relative file that
 * counts while it exists even when git ignores it (an install stamp, `node_modules/.install-stamp`):
 * a variant recorded before it appeared or changed is stale. The base diff never lists an ignored file.
 *
 * @example
 * ```json
 * {
 *     "nzyme": {
 *         "affected": {
 *             "baseBranches": ["main", "release"],
 *             "aliases": [{ "prefix": "@/", "packages": ["@acme/app"] }],
 *             "rewrites": [{ "from": ".loc.yaml", "to": ".loc.ts" }],
 *             "fullRunTriggers": ["package.json", "bun.lock", "**\/tsconfig*.json"],
 *             "ignore": ["**\/*.md", "docs/**"],
 *             "suites": {
 *                 "e2e": { "patterns": ["**\/*.spec.ts"], "traced": true, "fullRunTriggers": ["playwright.config.ts"] }
 *             }
 *         }
 *     }
 * }
 * ```
 */
export interface AffectedConfig {
    /** Branches auto base detection tries, as `origin/<name>`; the nearest merge-base wins. Default `["main"]`. */
    baseBranches: string[];
    /** Path aliases resolved by the import graph, e.g. Nuxt's `@/`. */
    aliases: ImportAlias[];
    /** Changed files that also stand for a change of another path. */
    rewrites: AffectedRewrite[];
    /** Root-relative globs: a changed file matching one selects every file matching the patterns. */
    fullRunTriggers: string[];
    /** Root-relative globs: a changed file matching one selects nothing (unless it is also a trigger). */
    ignore: string[];
    /** Test suites selected from recorded variants, by name (`openTestSelector`). */
    suites: Record<string, AffectedSuiteConfig>;
}

/** One suite of `nzyme.affected.suites`. */
export interface AffectedSuiteConfig {
    /**
     * Selection globs of the suite's test files, with the rule of `nzyme git affected` patterns: the
     * default of a `--suite` run given no patterns. Absent when every caller passes its own (or selects
     * through `nzyme git affected-test-list`/`affected-record`, which take no patterns).
     */
    patterns?: string[];
    /**
     * Whether a run records what each test executed. A test of a traced suite with no recorded
     * variant always runs; one of a static suite runs when the suite's triggers changed (a dependency
     * update never lets a test skip) and otherwise falls back to the base diff. Default `false`.
     */
    traced: boolean;
    /**
     * Root-relative globs whose change invalidates every variant of the suite, on top of the
     * top-level `fullRunTriggers`.
     */
    fullRunTriggers: string[];
}

/**
 * Suffix → suffix: a changed file whose path ends in `from` is also treated as a change of the same
 * path with `to` in place of that suffix — whether or not that path exists. `{ from: '.handler.ts',
 * to: '.ts' }` makes `x/Foo.handler.ts` also change `x/Foo.ts`.
 */
export interface AffectedRewrite {
    from: string;
    to: string;
}

/**
 * Reads {@link AffectedConfig} from the `nzyme.affected` field of `<root>/package.json`. A missing
 * field is the default config; a malformed one throws, naming the offending path.
 */
export async function readAffectedConfig(root: string): Promise<AffectedConfig> {
    const nzyme = await readNzymeConfig(root);
    return parseAffectedConfig(isPlainObject(nzyme) ? nzyme.affected : undefined);
}

/**
 * Validates a raw `nzyme.affected` value into an {@link AffectedConfig}, applying the defaults.
 * Hand-rolled rather than schema-based, like the code index config: the shape is small and this
 * keeps the CLI free of a validation dependency.
 * @__NO_SIDE_EFFECTS__
 */
export function parseAffectedConfig(value: unknown): AffectedConfig {
    const config: AffectedConfig = {
        baseBranches: ['main'],
        aliases: [],
        rewrites: [],
        fullRunTriggers: [],
        ignore: [],
        suites: {},
    };
    if (value === undefined) {
        return config;
    }
    if (!isPlainObject(value)) {
        throw configError('nzyme.affected', 'an object');
    }

    if (value.baseBranches !== undefined) {
        config.baseBranches = parseStringArray(value.baseBranches, 'nzyme.affected.baseBranches');
        if (config.baseBranches.length === 0) {
            throw configError('nzyme.affected.baseBranches', 'a non-empty array of strings');
        }
    }
    if (value.aliases !== undefined) {
        config.aliases = parseArray(value.aliases, 'nzyme.affected.aliases', parseAlias);
    }
    if (value.rewrites !== undefined) {
        config.rewrites = parseArray(value.rewrites, 'nzyme.affected.rewrites', parseRewrite);
    }
    if (value.fullRunTriggers !== undefined) {
        config.fullRunTriggers = parseStringArray(value.fullRunTriggers, 'nzyme.affected.fullRunTriggers');
    }
    if (value.ignore !== undefined) {
        config.ignore = parseStringArray(value.ignore, 'nzyme.affected.ignore');
    }
    if (value.suites !== undefined) {
        config.suites = parseSuites(value.suites, 'nzyme.affected.suites');
    }

    return config;
}

/** Validates `suites`; a name is a store directory, so it is limited to `[A-Za-z0-9_.-]`. */
function parseSuites(value: unknown, path: string): Record<string, AffectedSuiteConfig> {
    if (!isPlainObject(value)) {
        throw configError(path, 'an object');
    }

    const suites: Record<string, AffectedSuiteConfig> = {};
    for (const [name, suite] of Object.entries(value)) {
        if (!/^[\w.-]+$/.test(name) || name === '.' || name === '..') {
            throw configError(`${path}.${name}`, 'named with letters, digits, `_`, `.` or `-` only');
        }
        suites[name] = parseSuite(suite, `${path}.${name}`);
    }
    return suites;
}

/** Validates one `suites` entry. */
function parseSuite(value: unknown, path: string): AffectedSuiteConfig {
    if (!isPlainObject(value)) {
        throw configError(path, 'an object');
    }

    if (value.traced !== undefined && typeof value.traced !== 'boolean') {
        throw configError(`${path}.traced`, 'a boolean');
    }

    const suite: AffectedSuiteConfig = {
        traced: value.traced ?? false,
        fullRunTriggers:
            value.fullRunTriggers === undefined
                ? []
                : parseStringArray(value.fullRunTriggers, `${path}.fullRunTriggers`),
    };
    if (value.patterns !== undefined) {
        suite.patterns = parseStringArray(value.patterns, `${path}.patterns`);
        if (suite.patterns.length === 0) {
            throw configError(`${path}.patterns`, 'a non-empty array of strings');
        }
    }
    return suite;
}

/** Validates one `aliases` entry. */
function parseAlias(value: unknown, path: string): ImportAlias {
    if (!isPlainObject(value)) {
        throw configError(path, 'an object');
    }

    return {
        prefix: parseString(value.prefix, `${path}.prefix`),
        packages: parseStringArray(value.packages, `${path}.packages`),
    };
}

/** Validates one `rewrites` entry. */
function parseRewrite(value: unknown, path: string): AffectedRewrite {
    if (!isPlainObject(value)) {
        throw configError(path, 'an object');
    }

    return {
        from: parseString(value.from, `${path}.from`),
        to: parseString(value.to, `${path}.to`),
    };
}
