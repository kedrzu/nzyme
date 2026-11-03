/**
 * Configuration interface for Nzyme package settings
 */
export interface NzymePackageConfig {
    /** Whether to enable CommonJS module format */
    cjs?: boolean;
    /** Plugin modules of a repo, in its root `package.json`: paths relative to the project root. */
    plugins?: string[];
}
