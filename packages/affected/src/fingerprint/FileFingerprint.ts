/**
 * Hashes of a source file's runtime code, split by when that code runs. Formatting is part of neither
 * hash; in scripts, neither are types and comments (Vue SFC blocks and stylesheets keep their comments).
 */
export interface FileFingerprint {
    /** Hash of the outermost function bodies: code that runs only when something calls it. */
    body: string;
    /** Hash of the rest of the module: code that runs when the module loads, imports included. */
    top: string;
    /**
     * Specifiers of the literal `import('…')` calls in the code that runs on load (outside every
     * function body): the module loads them whenever it is loaded itself.
     */
    loadImports: string[];
}

/**
 * A file's fingerprint, or `'whole'` when it has no structure to split — not a script, SFC or
 * stylesheet, or one that does not parse. A `'whole'` file counts as changed as a whole whenever its bytes change, and
 * comparing the bytes is the caller's job.
 */
export type FileFingerprintResult = FileFingerprint | 'whole';
