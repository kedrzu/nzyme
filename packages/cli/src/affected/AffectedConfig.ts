import type { ImportAlias } from '@nzyme/project-utils/importGraph/resolveImportTarget.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { createConfigParsers } from '../utils/createConfigParsers.js';
import { readNzymeConfig } from '../utils/readNzymeConfig.js';

const { parseArray, parseStringArray, parseString, configError } = createConfigParsers('affected');

/**
 * Configuration of `nzyme affected`, read from the `nzyme.affected` field of the repo's root
 * `package.json`. Everything is optional; {@link readAffectedConfig} fills in the defaults.
 *
 * `fullRunTriggers` and `ignore` are globs (`Bun.Glob`) always matched against the root-relative
 * path — unlike the command's selection patterns, a glob without `/` is NOT matched against the
 * basename. So `package.json` is the root manifest only (a package's own `package.json` is handled
 * separately: it stands for a change of every source file of that package), and a glob meant for
 * every directory says so: `**\/tsconfig*.json`.
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
 *             "ignore": ["**\/*.md", "docs/**"]
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

    return config;
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
