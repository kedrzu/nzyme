/**
 * One line of a trace file. The probe writes one NDJSON file per process and thread,
 * `<pid>-<threadId>.ndjson` in `$NZYME_TRACE_DIR`: a `start` line, then a `flush` line every
 * `bucketMs` (and on exit), a `ready` line when the process calls `markReady()`, a `stale` line for
 * each loaded file built before one of its sources changed, and an `end` line on a clean exit. A file without `end` belongs to a process that was killed or is still running; its
 * last `flush.at` says until when its hits are complete.
 */
export type TraceLine = TraceStartLine | TraceFlushLine | TraceReadyLine | TraceStaleLine | TraceEndLine;

/** The first line of a trace file. */
export interface TraceStartLine {
    type: 'start';
    /** Wall-clock milliseconds, as every `at` in the file. */
    at: number;
    pid: number;
    /** 0 for the main thread. */
    threadId: number;
    argv: string[];
    cwd: string;
    /** Absolute project root; every recorded path is relative to it, with `/` separators. */
    root: string;
    /** Bucket width: a hit in bucket `b` happened in `[b * bucketMs, (b + 1) * bucketMs)`. */
    bucketMs: number;
}

/**
 * What the process recorded since the previous flush. Written every `bucketMs` even when empty: its
 * `at` is the heartbeat proving the process was alive and every hit up to it is in the file.
 */
export interface TraceFlushLine {
    type: 'flush';
    at: number;
    /** Source files registered since the previous flush, as `[fileId, path]`. */
    files: [fileId: number, path: string][];
    hits: TraceHitGroup[];
}

/**
 * Source files executed in one bucket under one label: `null` is code run outside any labelled
 * scope. A file repeats across flushes and buckets, never within one group.
 */
export type TraceHitGroup = [bucket: number, label: string | null, fileIds: number[]];

/** Written when the process calls `markReady()`: hits before it are startup code. */
export interface TraceReadyLine {
    type: 'ready';
    at: number;
}

/**
 * Written when the process loads a built file older than some of its sources: what runs from those
 * sources is not what is on disk, so a test that ran them records nothing.
 */
export interface TraceStaleLine {
    type: 'stale';
    at: number;
    /** The built file, root-relative. */
    file: string;
    /** Its sources modified after it was built, root-relative. */
    sources: string[];
}

/** The last line of a trace file whose process exited cleanly. */
export interface TraceEndLine {
    type: 'end';
    at: number;
}
