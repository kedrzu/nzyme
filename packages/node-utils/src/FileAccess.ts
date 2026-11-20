/**
 * Where a command may read or write local files: every path must resolve, symlinks followed, inside
 * one of `roots`. Used by the agent CLIs so a file outside the allowed directories never reaches an
 * external service, and a download never lands outside them.
 */
export interface FileAccess {
    /** Relative paths resolve here. */
    baseDir: string;
    /** Files must live under one of these. */
    roots: string[];
}
