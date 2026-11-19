/**
 * The environment variable naming the directory `@nzyme/trace`'s file-access preload writes to; unset,
 * the preload records nothing. `nzyme git affected --junit` sets it for the command it runs.
 */
export const FS_TRACE_DIR_ENV = 'NZYME_FS_TRACE_DIR';

/**
 * One line of a file-access trace: one NDJSON file per process, `<pid>.ndjson` in
 * `$NZYME_FS_TRACE_DIR`. A `start` line proves the process was traced; each `access` line is the
 * first access of its kind to a path by one test file. Paths are absolute.
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
 * - `write` — wrote it: a read of it afterwards is the test's own output, not an input;
 * - `opaque` — started a process, a worker or `Bun.build`, whose file reads the trace cannot see
 *   (`path` is empty).
 */
export interface FsTraceAccessLine {
    type: 'access';
    kind: FsAccessKind;
    /** The test file (`Bun.main`) running when the access happened. */
    test: string;
    path: string;
}

/** See {@link FsTraceAccessLine}. */
export type FsAccessKind = 'read' | 'list' | 'tree' | 'write' | 'opaque';
