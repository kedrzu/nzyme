/** What one trace file (one traced process or thread) recorded so far, read by `createTraceDirReader`. */
export interface TraceProcess {
    /** The trace file's name, `<pid>-<threadId>.ndjson`. */
    name: string;
    /** Bucket width of its hits, in milliseconds. */
    bucketMs: number;
    /** When it called `markReady()`; `undefined` while it has not. */
    readyAt?: number;
    /** The `at` of its last flush: every hit up to it is in the file. */
    flushedAt?: number;
    /** When it exited cleanly; then every hit is in the file. */
    endedAt?: number;
    hits: TraceProcessHit[];
    /** Sources it ran from a stale build (see `TraceStaleLine`), root-relative. */
    stale: Set<string>;
}

/** Source files a process ran in one bucket under one label. */
export interface TraceProcessHit {
    bucket: number;
    /** The label of the scope the code ran in; `null` outside any labelled scope. */
    label: string | null;
    /** Root-relative source files. */
    files: string[];
    /** Flushed before the process's `ready` line: startup code. */
    beforeReady: boolean;
}
