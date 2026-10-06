import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Configuration of `nzyme index`, read from the `nzyme.index` field of the repo's root
 * `package.json`. Everything is optional: the generic kinds (services, commands, factories,
 * endpoints, components, `@util` helpers) are always indexed, and this only adds what is specific to
 * one repo — which packages feed the global `UTILS.md`, extra `defineX` DSLs, and database entities.
 *
 * @example
 * ```json
 * {
 *     "nzyme": {
 *         "index": {
 *             "globalUtilPackages": ["@acme/utils", "@nzyme/utils"],
 *             "defineKinds": [
 *                 { "kind": "actor", "section": "Actors", "callee": "defineActor", "nameKey": "type", "order": 40 }
 *             ],
 *             "entities": { "packages": ["@acme/database"], "tableFunctions": ["pgTable"] }
 *         }
 *     }
 * }
 * ```
 */
export interface NzymeIndexConfig {
    /**
     * Packages whose `@util` helpers are context-agnostic enough to also be listed in the root
     * `UTILS.md`. Every package's `@util` helpers still appear in that package's own `INDEX.md`; only
     * these foundational packages additionally surface in the repo-wide catalogue. Without any, no
     * `UTILS.md` is written.
     */
    globalUtilPackages?: string[];
    /** Further `defineX` DSLs to index, beside the built-in services, commands, factories and endpoints. */
    defineKinds?: NzymeIndexDefineKindConfig[];
    /** Database entities — exported table definitions — to index. Not indexed when absent. */
    entities?: NzymeIndexEntitiesConfig;
}

/**
 * An extra `export const X = defineX({ ... })` DSL to index, e.g. `defineActor` — a table row rather
 * than code, because every `defineX` kind is matched the same way.
 */
export interface NzymeIndexDefineKindConfig {
    /** Identifier of the kind, e.g. 'actor'. Must not clash with a built-in kind. */
    kind: string;
    /** Heading of the per-package `INDEX.md` section listing these symbols, e.g. 'Actors'. */
    section: string;
    /** The function whose call marks the symbol, e.g. 'defineActor'. */
    callee: string;
    /** Key of the first-argument object literal holding the internal name. Defaults to 'name'. */
    nameKey?: string;
    /**
     * Position of the section within a package's `INDEX.md`; the built-in sections are Services 10,
     * Commands 20, Factories 30, Endpoints 50, Components 60, Entities 70 and Utils 80. Defaults to 55.
     */
    order?: number;
}

/** Which exported table definitions count as database entities, e.g. Drizzle's `pgTable(...)`. */
export interface NzymeIndexEntitiesConfig {
    /** Functions whose call defines a table, e.g. ['pgTable']; the table name is their first argument. */
    tableFunctions: string[];
    /** Packages whose tables are indexed — keeps look-alike calls elsewhere out. Every package when absent. */
    packages?: string[];
}

/**
 * Reads {@link NzymeIndexConfig} from the `nzyme.index` field of `<root>/package.json`, so a repo
 * configures the index next to its other tooling rather than in a separate file. A missing field is
 * an empty config; a malformed one throws, naming the offending path.
 */
export async function readIndexConfig(root: string): Promise<NzymeIndexConfig> {
    const packageJson: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const nzyme = isRecord(packageJson) ? packageJson.nzyme : undefined;
    const index = isRecord(nzyme) ? nzyme.index : undefined;

    return parseIndexConfig(index);
}

/**
 * Validates a raw `nzyme.index` value into an {@link NzymeIndexConfig}. Hand-rolled rather than
 * schema-based: the shape is small and this keeps the CLI free of a validation dependency.
 * @__NO_SIDE_EFFECTS__
 */
export function parseIndexConfig(value: unknown): NzymeIndexConfig {
    if (value === undefined) {
        return {};
    }
    if (!isRecord(value)) {
        throw configError('nzyme.index', 'an object');
    }

    const config: NzymeIndexConfig = {};

    if (value.globalUtilPackages !== undefined) {
        config.globalUtilPackages = parseStringArray(value.globalUtilPackages, 'nzyme.index.globalUtilPackages');
    }

    if (value.defineKinds !== undefined) {
        if (!Array.isArray(value.defineKinds)) {
            throw configError('nzyme.index.defineKinds', 'an array');
        }

        config.defineKinds = [];
        for (const [index, entry] of value.defineKinds.entries()) {
            config.defineKinds.push(parseDefineKind(entry, `nzyme.index.defineKinds[${index}]`));
        }
    }

    if (value.entities !== undefined) {
        config.entities = parseEntities(value.entities, 'nzyme.index.entities');
    }

    return config;
}

/** Validates one `defineKinds` entry. */
function parseDefineKind(value: unknown, path: string): NzymeIndexDefineKindConfig {
    if (!isRecord(value)) {
        throw configError(path, 'an object');
    }

    const kind: NzymeIndexDefineKindConfig = {
        kind: parseString(value.kind, `${path}.kind`),
        section: parseString(value.section, `${path}.section`),
        callee: parseString(value.callee, `${path}.callee`),
    };

    if (value.nameKey !== undefined) {
        kind.nameKey = parseString(value.nameKey, `${path}.nameKey`);
    }
    if (value.order !== undefined) {
        if (typeof value.order !== 'number' || !Number.isFinite(value.order)) {
            throw configError(`${path}.order`, 'a number');
        }
        kind.order = value.order;
    }

    return kind;
}

/** Validates the `entities` object. */
function parseEntities(value: unknown, path: string): NzymeIndexEntitiesConfig {
    if (!isRecord(value)) {
        throw configError(path, 'an object');
    }

    const entities: NzymeIndexEntitiesConfig = {
        tableFunctions: parseStringArray(value.tableFunctions, `${path}.tableFunctions`),
    };

    if (value.packages !== undefined) {
        entities.packages = parseStringArray(value.packages, `${path}.packages`);
    }

    return entities;
}

/** Validates an array of non-empty strings. */
function parseStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) {
        throw configError(path, 'an array of strings');
    }

    const strings: string[] = [];
    for (const [index, item] of value.entries()) {
        strings.push(parseString(item, `${path}[${index}]`));
    }
    return strings;
}

/** Validates a non-empty string. */
function parseString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value === '') {
        throw configError(path, 'a non-empty string');
    }
    return value;
}

/** The error for a config value of the wrong shape. */
function configError(path: string, expected: string): Error {
    return new Error(`Invalid code index config in package.json: \`${path}\` must be ${expected}.`);
}

/** True for a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
