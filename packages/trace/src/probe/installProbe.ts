import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { threadId } from 'node:worker_threads';

import { plugin } from 'bun';

import type { TraceRuntime } from '../runtime/TraceRuntime.js';
import { createSourceLocator } from './createSourceLocator.js';
import { instrumentScript } from './instrumentScript.js';
import { TRACE_BUCKET_MS, TraceRecorder } from './TraceRecorder.js';
import { TraceWriter } from './TraceWriter.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

/** Parameters of {@link installProbe}. */
export interface InstallProbeParams {
    traceDir: string;
    /** Absolute path of the preload module, handed to worker threads. */
    preloadPath: string;
}

/**
 * Turns tracing on in this process or thread: instruments every JavaScript module loaded from
 * under the project root (outside `node_modules` and this package), records the source files their
 * functions run under the current label, writes them to `<traceDir>/<pid>-<threadId>.ndjson`, and
 * installs the label runtime on `globalThis`. Call it once, from the preload.
 */
export function installProbe(params: InstallProbeParams) {
    // Real path: module paths Bun hands to the loader are resolved through symlinks.
    const root = realpathSync(getProjectRoot(process.cwd()));
    const ownDir = path.resolve(import.meta.dir, '../..');
    const als = new AsyncLocalStorage<string | null>();
    const recorder = new TraceRecorder();
    const writer = new TraceWriter(path.join(params.traceDir, `${process.pid}-${threadId}.ndjson`));
    const fileIds = new Map<string, number>();
    let newFiles: [number, string][] = [];

    writer.write({
        type: 'start',
        at: Date.now(),
        pid: process.pid,
        threadId,
        argv: process.argv,
        cwd: process.cwd(),
        root,
        bucketMs: TRACE_BUCKET_MS,
    });

    globalThis.__nzymeTraceHit = hit;
    const runtime: TraceRuntime = {
        scope: (label, fn) => als.run(label ?? null, fn),
        currentLabel: () => als.getStore() ?? undefined,
        markReady() {
            flush();
            writer.write({ type: 'ready', at: Date.now() });
        },
        preloadPath: params.preloadPath,
    };
    globalThis.__nzymeTrace = runtime;

    setInterval(flush, TRACE_BUCKET_MS).unref();
    process.on('exit', () => {
        flush();
        writer.write({ type: 'end', at: Date.now() });
        writer.close();
    });

    plugin({
        name: '@nzyme/trace',
        setup(build) {
            // Synchronous, so a `require()` of an instrumented file keeps working. The filter is
            // matched natively, so files it excludes (dependencies, this package) never reach JS.
            const ownRelative = path.relative(root, ownDir);
            const notOwn = ownRelative.startsWith('..') ? '' : `(?!${RegExp.escape(ownRelative + path.sep)})`;
            const filter = new RegExp(
                `^${RegExp.escape(root + path.sep)}${notOwn}(?!(?:.*/)?node_modules/).*\\.[cm]?js$`,
            );
            build.onLoad({ filter }, args => {
                const code = readFileSync(args.path, 'utf8');
                return { contents: instrumentFile(args.path, code), loader: 'js' };
            });
        },
    });

    function hit(fileId: number) {
        recorder.record(fileId, als.getStore() ?? null, Date.now());
    }

    function flush() {
        const files = newFiles;
        newFiles = [];
        writer.write({ type: 'flush', at: Date.now(), files, hits: recorder.drain() });
    }

    function instrumentFile(file: string, code: string) {
        try {
            const sourceAt = createSourceLocator({ file, code, root });
            const instrumented = instrumentScript({
                code,
                filename: file,
                fileIdAt: offset => {
                    const source = sourceAt(offset);
                    return source === undefined ? undefined : fileIdOf(source);
                },
            });
            if (instrumented !== undefined) {
                return instrumented;
            }
            // Tracing must never break the program: the file runs untraced, and the gap is reported.
            console.error(`[@nzyme/trace] ${file} does not parse as a module; it runs untraced`);
        } catch (error) {
            console.error(`[@nzyme/trace] failed to instrument ${file}; it runs untraced`, error);
        }
        return code;
    }

    function fileIdOf(source: string) {
        let id = fileIds.get(source);
        if (id === undefined) {
            id = fileIds.size;
            fileIds.set(source, id);
            newFiles.push([id, source]);
        }
        return id;
    }
}
