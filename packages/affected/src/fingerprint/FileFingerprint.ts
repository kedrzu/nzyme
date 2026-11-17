/**
 * Hashes of a source file's runtime code, split by when that code runs. Types and comments are not
 * part of either hash, and neither is formatting.
 */
export interface FileFingerprint {
    /** Hash of the outermost function bodies: code that runs only when something calls it. */
    body: string;
    /** Hash of the rest of the module: code that runs when the module loads, imports included. */
    top: string;
}

/**
 * A file's fingerprint, or `'whole'` when it has no structure to split — not a script, or a script
 * that does not parse. A `'whole'` file counts as changed as a whole whenever its bytes change, and
 * comparing the bytes is the caller's job.
 */
export type FileFingerprintResult = FileFingerprint | 'whole';
