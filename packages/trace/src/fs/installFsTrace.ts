import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FsAccessKind, FsTraceLine } from '@nzyme/affected/fsTrace/FsTraceLine.js';
import { assert } from '@nzyme/utils/assert.js';

import { FS_TRACED } from './isFsTraced.js';

/** Options of {@link installFsTrace}. */
export interface InstallFsTraceOptions {
    /** Where `<pid>.ndjson` goes; without it the functions are wrapped but nothing is recorded. */
    traceDir: string | undefined;
}

/** How a wrapped function's arguments map to the access it makes: its kind and its path argument. */
type AccessOf = (args: unknown[]) => [FsAccessKind, unknown];

function READ_PATH(args: unknown[]): ReturnType<AccessOf> {
    return ['read', args[0]];
}
/** `cp` copies a directory only with `recursive`; the trace does not see the files it reads in it. */
function COPY(args: unknown[]): ReturnType<AccessOf> {
    return hasOption(args[2], 'recursive') ? OPAQUE() : READ_PATH(args);
}
function LIST(args: unknown[]): ReturnType<AccessOf> {
    return [hasOption(args[1], 'recursive') ? 'tree' : 'list', args[0]];
}
function OPAQUE(): ReturnType<AccessOf> {
    return ['opaque', ''];
}

/** The `node:fs` functions (callback and sync), and the accesses each makes. */
const FS_FUNCTIONS: ReadonlyMap<string, AccessOf> = new Map([
    ['readFile', READ_PATH],
    ['readFileSync', READ_PATH],
    ['createReadStream', READ_PATH],
    ['exists', READ_PATH],
    ['existsSync', READ_PATH],
    ['stat', READ_PATH],
    ['statSync', READ_PATH],
    ['lstat', READ_PATH],
    ['lstatSync', READ_PATH],
    ['access', READ_PATH],
    ['accessSync', READ_PATH],
    ['realpath', READ_PATH],
    ['realpathSync', READ_PATH],
    ['open', READ_PATH],
    ['openSync', READ_PATH],
    ['readdir', LIST],
    ['readdirSync', LIST],
    ['opendir', LIST],
    ['opendirSync', LIST],
    ['copyFile', READ_PATH],
    ['copyFileSync', READ_PATH],
    ['cp', COPY],
    ['cpSync', COPY],
]);

/** The `node:fs/promises` functions. */
const FS_PROMISES_FUNCTIONS: ReadonlyMap<string, AccessOf> = new Map([
    ['readFile', READ_PATH],
    ['stat', READ_PATH],
    ['lstat', READ_PATH],
    ['access', READ_PATH],
    ['realpath', READ_PATH],
    ['open', READ_PATH],
    ['readdir', LIST],
    ['opendir', LIST],
    ['copyFile', READ_PATH],
    ['cp', COPY],
]);

/** The `node:child_process` functions: each starts a process. */
const CHILD_PROCESS_FUNCTIONS: readonly string[] = [
    'spawn',
    'spawnSync',
    'exec',
    'execSync',
    'execFile',
    'execFileSync',
    'fork',
];

/** The `Bun` functions; `$` is the shell, whose builtins (`cat`, `ls`) read files in-process. */
const BUN_FUNCTIONS: ReadonlyMap<string, AccessOf> = new Map([
    ['file', READ_PATH],
    ['$', OPAQUE],
    ['spawn', OPAQUE],
    ['spawnSync', OPAQUE],
    ['build', OPAQUE],
]);

/** This module's own file: its frames are on the stack of every access, and never the reader. */
const OWN_FILE = import.meta.filename;

/** Enough frames to pass the wrapper's own and the runtime's to the code that made the access. */
const READER_STACK_LIMIT = 16;

/**
 * Wraps the functions of `node:fs`, `node:fs/promises` and `Bun` that read the file system (and what
 * starts a process, a worker, the Bun shell or `Bun.build`, or copies a directory, whose reads it
 * cannot see) so that, with `traceDir`, the first access to a path by each module during each test
 * file is written to `<traceDir>/<pid>.ndjson` (see `FsTraceLine` of `@nzyme/affected`). The test
 * file is `Bun.main`, which `bun test` sets to each file it runs, also in one shared process; an access
 * a test leaves running past its file's end (a timer) goes to the next file. The module (`reader`) is
 * the innermost stack frame's file outside `node_modules` — a package doing the access for a module
 * (`fs-extra`, `graceful-fs`) is the module's — since a module that read a file once and kept what it
 * read serves every later test file that loads it, which only it tells.
 *
 * The modules are patched through `process.getBuiltinModule` and the named ESM imports re-synced, which
 * reaches every module that imports `node:fs` afterwards — so it must run before anything else imports
 * it: load it as the first preload. Module loading itself never goes through these functions.
 */
export function installFsTrace(options: InstallFsTraceOptions): void {
    const fs = process.getBuiltinModule('node:fs');
    const traceFile = options.traceDir ? path.join(options.traceDir, `${process.pid}.ndjson`) : undefined;
    const seen = new Set<string>();

    for (const [name, accessOf] of FS_FUNCTIONS) {
        wrapMethod(fs, name, accessOf);
    }
    wrapMethod(fs.realpathSync, 'native', READ_PATH);
    wrapMethod(fs.realpath, 'native', READ_PATH);
    for (const [name, accessOf] of FS_PROMISES_FUNCTIONS) {
        wrapMethod(fs.promises, name, accessOf);
    }
    const childProcess = process.getBuiltinModule('node:child_process');
    for (const name of CHILD_PROCESS_FUNCTIONS) {
        wrapMethod(childProcess, name, OPAQUE);
    }
    wrapMethod(process.getBuiltinModule('node:worker_threads'), 'Worker', OPAQUE);
    wrapMethod(globalThis, 'Worker', OPAQUE);
    for (const [name, accessOf] of BUN_FUNCTIONS) {
        wrapMethod(Bun, name, accessOf);
    }
    for (const name of ['scan', 'scanSync']) {
        wrapMethod(Bun.Glob.prototype, name, args => ['tree', globCwd(args[0])]);
    }
    process.getBuiltinModule('node:module').syncBuiltinESMExports();

    if (traceFile) {
        writeLine({ type: 'start' });
    }

    function wrapMethod(target: object, name: string, accessOf: AccessOf): void {
        const original: unknown = Reflect.get(target, name);
        if (typeof original !== 'function') {
            return;
        }
        const wrapped = new Proxy(original, {
            apply(fn, thisArg, args: unknown[]): unknown {
                record(accessOf(args));
                return Reflect.apply(fn, thisArg, args);
            },
            construct(fn, args: unknown[], newTarget): object {
                record(accessOf(args));
                const instance: unknown = Reflect.construct(fn, args, newTarget);
                assert(typeof instance === 'object' && instance !== null, `new ${name}() returned no object`);
                return instance;
            },
            get(fn, property, receiver): unknown {
                return property === FS_TRACED ? true : Reflect.get(fn, property, receiver);
            },
        });
        Reflect.set(target, name, wrapped);
    }

    function record([kind, target]: [FsAccessKind, unknown]): void {
        if (!traceFile) {
            return;
        }
        const file = kind === 'opaque' ? '' : toAbsolutePath(target);
        if (file === undefined || file.includes(`${path.sep}node_modules${path.sep}`)) {
            return;
        }
        const test = Bun.main;
        const reader = findReader();
        const key = `${kind}\0${test}\0${file}\0${reader}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        writeLine(
            reader === undefined
                ? { type: 'access', kind, test, path: file }
                : { type: 'access', kind, test, path: file, reader },
        );
    }

    function writeLine(line: FsTraceLine): void {
        if (traceFile) {
            fs.appendFileSync(traceFile, `${JSON.stringify(line)}\n`);
        }
    }
}

/**
 * The file of the innermost stack frame outside this module and `node_modules`, through V8's stack
 * trace API.
 */
function findReader(): string | undefined {
    // Restored as it was, a method of whoever set it (a source-map support) or absent.
    const prepareStackTrace: unknown = Reflect.get(Error, 'prepareStackTrace');
    const stackTraceLimit = Error.stackTraceLimit;
    let reader: string | undefined;
    Error.stackTraceLimit = READER_STACK_LIMIT;
    Error.prepareStackTrace = (_error, sites) => {
        for (const site of sites) {
            const file = site.getFileName();
            if (
                typeof file === 'string' &&
                path.isAbsolute(file) &&
                file !== OWN_FILE &&
                !file.includes(`${path.sep}node_modules${path.sep}`)
            ) {
                reader = file;
                break;
            }
        }
        return '';
    };
    try {
        const holder = {};
        Error.captureStackTrace(holder);
        // The stack is formatted, and so `prepareStackTrace` called, when it is first read.
        Reflect.get(holder, 'stack');
    } finally {
        Reflect.set(Error, 'prepareStackTrace', prepareStackTrace);
        Error.stackTraceLimit = stackTraceLimit;
    }
    return reader;
}

/** An absolute path from a path argument, or `undefined` for a file descriptor or handle. */
function toAbsolutePath(target: unknown): string | undefined {
    if (typeof target === 'string') {
        return path.resolve(target);
    }
    if (target instanceof URL) {
        return target.protocol === 'file:' ? fileURLToPath(target) : undefined;
    }
    if (Buffer.isBuffer(target)) {
        return path.resolve(target.toString());
    }
    return undefined;
}

/** The directory a `Bun.Glob` scan walks: its `cwd` option, or the working directory. */
function globCwd(options: unknown): string {
    if (typeof options === 'string') {
        return options;
    }
    if (typeof options === 'object' && options !== null && 'cwd' in options && typeof options.cwd === 'string') {
        return options.cwd;
    }
    return process.cwd();
}

/** Whether an options argument has `name: true`. */
function hasOption(options: unknown, name: string): boolean {
    return typeof options === 'object' && options !== null && Reflect.get(options, name) === true;
}
