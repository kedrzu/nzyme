import type { NzymeIndexConfig } from './NzymeIndexConfig.js';

/**
 * Declarative description of one `defineX(...)` DSL call the indexer extracts — how to spot it
 * (`callee`), where its internal name lives in the object literal (`nameKey`), and where it renders
 * (`section`/`order`). Kept data-driven (rather than a switch per kind) so adding a new `defineX` DSL
 * is a table row, not a new code path through the extractor.
 */
export interface DefineSymbolKind {
    /** Identifier of the kind, e.g. 'service'. */
    kind: string;
    /** Per-package INDEX.md heading this kind renders under, e.g. 'Services'. */
    section: string;
    /** The CallExpression identifier that marks this kind, e.g. 'defineService'. */
    callee: string;
    /** Object-literal key holding the internal name — also the label it renders with, e.g. 'name'. */
    nameKey: string;
    /** Ascending sort order among sections within a package's INDEX.md. */
    order: number;
}

/** Everything the crawl and the rendering need to know beyond the packages themselves. */
export interface IndexSettings {
    /** Every `defineX` kind to extract — the built-in ones plus the configured ones — by ascending order. */
    defineKinds: readonly DefineSymbolKind[];
    /** Packages whose `@util` helpers feed the root `UTILS.md`; empty means no `UTILS.md`. */
    globalUtilPackages: ReadonlySet<string>;
    /** Table-builder functions marking entities, and the packages they count in (null = all); null = no entities. */
    entities: {
        tableFunctions: ReadonlySet<string>;
        packages: ReadonlySet<string> | null;
    } | null;
}

/**
 * The `defineX` DSL kinds every repo gets: those of the nzyme framework itself (`defineService`,
 * `defineCommand`, `defineFactory`, `defineEndpoint`). Orders leave gaps so configured kinds can
 * slot in between.
 */
export const BUILTIN_DEFINE_KINDS: readonly DefineSymbolKind[] = [
    { kind: 'service', section: 'Services', callee: 'defineService', nameKey: 'name', order: 10 },
    { kind: 'command', section: 'Commands', callee: 'defineCommand', nameKey: 'name', order: 20 },
    { kind: 'factory', section: 'Factories', callee: 'defineFactory', nameKey: 'name', order: 30 },
    { kind: 'endpoint', section: 'Endpoints', callee: 'defineEndpoint', nameKey: 'name', order: 50 },
];

/** Section title + render order for the kinds that aren't `defineX` DSL calls. */
export const EXTRA_SECTIONS = {
    component: { section: 'Components', order: 60 },
    entity: { section: 'Entities', order: 70 },
    util: { section: 'Utils', order: 80 },
} as const;

/** Where a configured `defineX` kind renders when its config gives no order: after Endpoints. */
const DEFAULT_DEFINE_KIND_ORDER = 55;

/** Kinds a configured `defineX` kind may not reuse — they already mean something else. */
const RESERVED_KINDS = new Set([...BUILTIN_DEFINE_KINDS.map(kind => kind.kind), ...Object.keys(EXTRA_SECTIONS)]);

/**
 * Resolves a repo's {@link NzymeIndexConfig} into the settings the indexer runs on: defaults
 * applied, configured `defineX` kinds merged after the built-in ones, lists turned into sets.
 * Throws when a configured kind clashes with a built-in kind or callee, which would otherwise
 * silently shadow it.
 * @__NO_SIDE_EFFECTS__
 */
export function getIndexSettings(config: NzymeIndexConfig): IndexSettings {
    const defineKinds = [...BUILTIN_DEFINE_KINDS];
    const callees = new Set(BUILTIN_DEFINE_KINDS.map(kind => kind.callee));

    for (const kind of config.defineKinds ?? []) {
        if (RESERVED_KINDS.has(kind.kind) || defineKinds.some(existing => existing.kind === kind.kind)) {
            throw new Error(`Code index kind "${kind.kind}" is already defined.`);
        }
        if (callees.has(kind.callee)) {
            throw new Error(`Code index callee "${kind.callee}" is already indexed.`);
        }

        callees.add(kind.callee);
        defineKinds.push({
            kind: kind.kind,
            section: kind.section,
            callee: kind.callee,
            nameKey: kind.nameKey ?? 'name',
            order: kind.order ?? DEFAULT_DEFINE_KIND_ORDER,
        });
    }

    return {
        defineKinds: defineKinds.toSorted((a, b) => a.order - b.order),
        globalUtilPackages: new Set(config.globalUtilPackages ?? []),
        entities: config.entities
            ? {
                  tableFunctions: new Set(config.entities.tableFunctions),
                  packages: config.entities.packages ? new Set(config.entities.packages) : null,
              }
            : null,
    };
}
