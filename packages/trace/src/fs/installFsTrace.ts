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

/** How a wrapped function's arguments map to accesses. */
type AccessOf = (args: unknown[]) => [FsAccessKind, unknown][];

const READ_PATH: AccessOf = args => [['read', args[0]]];
const WRITE_PATH: AccessOf = args => [['write', args[0]]];
const COPY: AccessOf = args => [
    ['read', args[0]],
    ['write', args[1]],
];
const RENAME: AccessOf = args => [
    ['write', args[0]],
    ['write', args[1]],
];
const LIST: AccessOf = args => [[hasOption(args[1], 'recursive') ? 'tree' : 'list', args[0]]];
const OPEN: AccessOf = args => [[isWriteFlag(args[1]) ? 'write' : 'read', args[0]]];
const OPAQUE: AccessOf = () => [['opaque', '']];

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
    ['open', OPEN],
    ['openSync', OPEN],
    ['readdir', LIST],
    ['readdirSync', LIST],
    ['opendir', LIST],
    ['opendirSync', LIST],
    ['copyFile', COPY],
    ['copyFileSync', COPY],
    ['cp', COPY],
    ['cpSync', COPY],
    ['writeFile', WRITE_PATH],
    ['writeFileSync', WRITE_PATH],
    ['appendFile', WRITE_PATH],
    ['appendFileSync', WRITE_PATH],
    ['createWriteStream', WRITE_PATH],
    ['mkdir', WRITE_PATH],
    ['mkdirSync', WRITE_PATH],
    ['rename', RENAME],
    ['renameSync', RENAME],
]);

/** The `node:fs/promises` functions. */
const FS_PROMISES_FUNCTIONS: ReadonlyMap<string, AccessOf> = new Map([
    ['readFile', READ_PATH],
    ['stat', READ_PATH],
    ['lstat', READ_PATH],
    ['access', READ_PATH],
    ['realpath', READ_PATH],
    ['open', OPEN],
    ['readdir', LIST],
    ['opendir', LIST],
    ['copyFile', COPY],
    ['cp', COPY],
    ['writeFile', WRITE_PATH],
    ['appendFile', WRITE_PATH],
    ['mkdir', WRITE_PATH],
    ['rename', RENAME],
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

/** The `Bun` functions. */
const BUN_FUNCTIONS: ReadonlyMap<string, AccessOf> = new Map([
    ['file', READ_PATH],
    ['write', args => [['write', bunFileName(args[0])]]],
    ['spawn', OPAQUE],
    ['spawnSync', OPAQUE],
    ['build', OPAQUE],
]);

/**
 * Wraps the file-system functions of `node:fs`, `node:fs/promises` and `Bun` (and what starts a
 * process, a worker or `Bun.build`) so that, with `traceDir`, each first access of a test file to a
 * path is written to `<traceDir>/<pid>.ndjson` (see `FsTraceLine` of `@nzyme/affected`). The test file
 * is `Bun.main`, which `bun test` sets to each file it runs, also in one shared process; an access a
 * test leaves running past its file's end (a timer) goes to the next file.
 *
 * The modules are patched through `process.getBuiltinModule` and the named ESM imports re-synced, which
 * reaches every module that imports `node:fs` afterwards — so it must run before anything else imports
 * it: load it as the first preload. Module loading itself never goes through these functions.
 */
export function installFsTrace(options: InstallFsTraceOptions): void {
    const fs = process.getBuiltinModule('node:fs');
    // Captured before wrapping: the trace's own writes are not accesses.
    const appendFileSync = fs.appendFileSync;
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
        wrapMethod(Bun.Glob.prototype, name, args => [['tree', globCwd(args[0])]]);
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

    function record(accesses: [FsAccessKind, unknown][]): void {
        if (!traceFile) {
            return;
        }
        const test = Bun.main;
        for (const [kind, target] of accesses) {
            const file = kind === 'opaque' ? '' : toAbsolutePath(target);
            if (file === undefined || file.includes(`${path.sep}node_modules${path.sep}`)) {
                continue;
            }
            const key = `${kind}\0${test}\0${file}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            writeLine({ type: 'access', kind, test, path: file });
        }
    }

    function writeLine(line: FsTraceLine): void {
        if (traceFile) {
            appendFileSync(traceFile, `${JSON.stringify(line)}\n`);
        }
    }
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

/** The path of `Bun.write`'s destination: a path, a URL or a `BunFile`. */
function bunFileName(target: unknown): unknown {
    return typeof target === 'object' && target !== null && 'name' in target ? target.name : target;
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

/** Whether an `open` flag writes: `w`, `a` or `+` modes, or numeric write flags. */
function isWriteFlag(flags: unknown): boolean {
    if (typeof flags === 'string') {
        return /[wa+]/.test(flags);
    }
    if (typeof flags === 'number') {
        const { O_WRONLY, O_RDWR } = process.getBuiltinModule('node:fs').constants;
        return (flags & (O_WRONLY | O_RDWR)) !== 0;
    }
    return false;
}
