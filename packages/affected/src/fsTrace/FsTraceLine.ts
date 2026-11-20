/**
 * The environment variable naming the directory `@nzyme/trace`'s file-access preload writes to; unset,
 * the preload records nothing. `nzyme git affected --junit` sets it for the command it runs.
 */
export const FS_TRACE_DIR_ENV = 'NZYME_FS_TRACE_DIR';

/**
 * One line of a file-access trace: one NDJSON file per process, `<pid>.ndjson` in
 * `$NZYME_FS_TRACE_DIR`. A `start` line proves the process was traced; each `access` line is the
 * first access of its kind to a path by one module during one test file. Paths are absolute.
 */
export type FsTraceLine = FsTraceStartLine | FsTraceAccessLine;

/** Written once the preload is installed. */
export interface FsTraceStartLine {
    type: 'start';
}

/**
 * What a test file did to a path:
 * - `read` — read or checked it (`readFile`, `stat`, `existsSync`, `Bun.file`, …);
 * - `list` — read a directory's entries (`readdir`, `opendir`);
 * - `tree` — read every path under a directory (a recursive `readdir`, a `Bun.Glob` scan);
 * - `opaque` — started a process, a worker, the Bun shell or `Bun.build`, or copied a directory: its
 *   file reads the trace cannot see (`path` is empty).
 */
export interface FsTraceAccessLine {
    type: 'access';
    kind: FsAccessKind;
    /** The test file (`Bun.main`) running when the access happened. */
    test: string;
    path: string;
    /**
     * The file of the innermost stack frame outside `node_modules` (the module whose code made the
     * access, or called the package that did: the test file or a module it loaded); absent when no
     * frame is one.
     */
    reader?: string;
}

/** See {@link FsTraceAccessLine}. */
export type FsAccessKind = 'read' | 'list' | 'tree' | 'opaque';
