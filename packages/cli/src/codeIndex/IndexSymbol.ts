/**
 * The symbol kinds the indexer always knows, each with its own detection strategy: a `defineX` DSL
 * callee (`service`/`command`/`factory`/`endpoint`), a `.vue` file (`component`), a table-builder
 * call (`entity`, only when configured) or a `@util` JSDoc tag (`util`). A repo adds further
 * `defineX` kinds through its `nzyme.index.defineKinds` config, which is why
 * {@link IndexSymbol.kind} is an open string rather than this union.
 */
export type BuiltinIndexSymbolKind =
    | 'command' // defineCommand
    | 'component' // .vue component
    | 'endpoint' // defineEndpoint
    | 'entity' // a configured table-builder call, e.g. pgTable
    | 'factory' // defineFactory
    | 'service' // defineService
    | 'util'; // @util-tagged helper → UTILS.md

/**
 * A single exported symbol discovered while walking the monorepo — the shared record every
 * extractor produces and every renderer consumes. Kept intentionally flat (no per-kind subtypes) so
 * renderers can treat all kinds uniformly and only branch on `kind` for the handful of fields that
 * are kind-specific.
 */
export interface IndexSymbol {
    /** A {@link BuiltinIndexSymbolKind} or a configured `defineX` kind, e.g. 'actor'. */
    kind: string;
    /** Owning workspace package name, e.g. '@acme/database'. */
    packageName: string;
    /** Exported const/component identifier, e.g. 'PaymentClient'. */
    exportName: string;
    /** Deep import specifier a consumer would write, e.g. '@acme/payments/PaymentClient.js'. */
    importPath: string;
    /** Internal name the DSL carries (`name:` of a service/command/endpoint, a table name), else null. */
    internalName: string | null;
    /** One-line description (JSDoc summary / Vue leading comment), else null. */
    description: string | null;
    /** Rendered signature — only used for kind 'util', else null. */
    signature: string | null;
    /** Repo-relative declaring file path — stable sort key. */
    relPath: string;
}
