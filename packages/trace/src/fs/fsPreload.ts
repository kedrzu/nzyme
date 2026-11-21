/**
 * The `@nzyme/trace/fs-preload` entry: wraps the file-system functions (`installFsTrace`) and, with
 * `NZYME_FS_TRACE_DIR` set (`nzyme git affected --junit` sets it), records which files each test file
 * accesses. List it FIRST in `bunfig.toml`'s `[test] preload`: a preload loaded before it that imports
 * `node:fs` leaves the named imports unwrapped, which `isFsTraced` lets a test of the consumer check.
 */
import { FS_TRACE_DIR_ENV } from '@nzyme/affected/fsTrace/FsTraceLine.js';

import { FS_TRACED } from './isFsTraced.js';
import { installFsTrace } from './installFsTrace.js';

// A second load must not wrap every function twice.
// oxlint-disable-next-line nzyme/no-module-state -- a preload exists to install the trace into the process as it loads.
if (Reflect.get(process.getBuiltinModule('node:fs').readFileSync, FS_TRACED) !== true) {
    installFsTrace({ traceDir: process.env[FS_TRACE_DIR_ENV] });
}
