# @nzyme/trace

Records which source files a Bun process executes, and under which test label, so a test runner can
select the tests a change can affect. Bun only.

## Turning it on

The probe is a preload; nothing runs it otherwise, and production code never imports it.

```bash
BUN_OPTIONS="--preload=$(realpath node_modules/@nzyme/trace/dist/probe/preload.js)" \
NZYME_TRACE_DIR=/tmp/trace \
bun ./dist/server.js
```

- `BUN_OPTIONS` takes the `=` form of `--preload` with an absolute path; with a space `bun run`
  breaks. Resolve the path through the `@nzyme/trace/preload` export.
- `NZYME_TRACE_DIR` is where the trace files go. Unset, the preload does nothing at all.
- Child processes inherit both variables and are traced. Worker threads do not inherit preloads:
  create them with `new Worker(path, { ...workerPreloadOptions() })`.

The probe instruments every JavaScript file under the project root (the workspace root found from
the working directory) outside `node_modules`, and maps each function to its original source file
through the file's source map. Sources outside the root or in `node_modules` are not recorded.

## File accesses of `bun test`

`@nzyme/trace/fs-preload` records which files each test file of a `bun test` run reads, for
`nzyme git affected --junit` to store with the test's variant. List it first in `bunfig.toml`:

```toml
[test]
preload = ["@nzyme/trace/fs-preload", "./test/setup.ts"]
```

It wraps `node:fs`, `node:fs/promises`, `Bun.file` and `Bun.Glob` scans, and marks a test file that
starts a process, a worker, the Bun shell (`Bun.$`), `Bun.build` or a recursive `cp` as opaque, since
what those read is not seen. Each access also names the module that made it — the innermost stack
frame outside `node_modules` — so a read cached by a module counts for every test file that loads it.
It reaches the named imports (`import { readFileSync } from 'node:fs'`) only of modules that import
`node:fs` after it loads; check that in a test of your own with `isFsTraced(readFileSync)`
(`fs/isFsTraced.js`). With `NZYME_FS_TRACE_DIR` unset the functions stay wrapped but nothing is
recorded. Accesses go to `Bun.main`, the file `bun test` is running, one `<pid>.ndjson` per process;
the line types are `FsTraceLine` of `@nzyme/affected`.

## Labels

Infrastructure code, not domain code, carries the label:

- `traceScope(label, fn)` (`runtime/traceScope.js`) — at every entry point (HTTP request, WebSocket or
  queue message), with the label read from the input.
- `currentTraceLabel()` — to put the label on an outgoing message.
- `markReady()` — once the process serves requests; what ran before is startup code.

All three do nothing without the probe. A label reaches Effect fibers started in its scope and the
async work they await, and a fiber started outside any label (a startup loop, a poller) stays
unlabelled. The probe has no Effect integration: Effect 4 itself carries the AsyncLocalStorage
context of a fork into the fiber and every resumption. Pin `effect` and keep a test of your own that
forks, sleeps and awaits inside an `AsyncLocalStorage` scope, so an upgrade that stops carrying the
context fails it.

## Trace files

One NDJSON file per process and thread, `<pid>-<threadId>.ndjson`; the line types are `TraceLine` in
`TraceLine.ts`.

## Playwright

`@nzyme/trace/playwright/*` writes, per test, what the traced servers and the test's browsers ran,
for `nzyme git affected-record` to store as the variants of `@nzyme/affected`.

- `traceTest` (`playwright/traceTest.js`) — re-export it as the suite's `test` and set
  `use: { nzymeTrace: { apps } }` (`TracedApp`: the app's origin, its source `public/` and the built
  output it serves, with source maps). Each context of a test, including one the test creates with
  `browser.newContext()`, sends the test's label in the `x-nzyme-trace` header and the `nzyme-trace`
  cookie for `localhost`; Chromium's JavaScript coverage of its pages, mapped through the bundles'
  source maps, and the `public/` files they fetched are attached to the result. A Node-side client
  sends `getTestTraceLabel(test.info())`. Chromium is launched without the features that swap the
  renderer on navigation, which would drop the coverage of the page before.
- `TraceReporter` (`playwright/TraceReporter.js`, default export) —
  `['@nzyme/trace/playwright/TraceReporter.js', { resultsFile, traceDir }]`. When the
  run ends — Playwright stops its web servers before — it reads `traceDir` once, attributes every
  attempt in one pass (`attributeExecution`) and writes one line per attempt to `resultsFile`
  (`TracedTestResult` of `@nzyme/affected`): failed, passed with an incomplete trace and the reason
  (`no-heartbeat`, `stale-build`, `unprobed`, …), or passed with what it executed — the servers'
  files (`executed`) apart from the browser's (`browserExecuted`), its assets and the run's startup
  code. Every line carries the servers' files, failed and incomplete attempts included, because
  `nzyme git affected-record` hashes a file any server ran in the run in full in every variant that
  imports it. A process that neither ended nor flushed up to a test's end (it was killed, or hung) makes that test
  incomplete (`no-heartbeat`); the probe flushes on `SIGINT`/`SIGTERM`, so a server stopped by a
  signal still proves it ran past the last test. A stale build makes the whole run incomplete: a
  built file any server process loaded, or a bundle any page loaded, that was not built from its
  sources' current content — the source map's `sourcesContent` differs, or, without it, the `tsgo`
  build info's hash of the source does; an asset is compared by modification time. A test's variant
  hashes files whose functions it never ran (their top level), so staleness is not judged per test.
  `traceDir` must be fresh per run. A server the run did not start (a dev server, a reused one)
  writes nothing there, so every passed attempt is `unprobed` and not recorded, while a failed one
  is still written: it invalidates variants and `--full` audits it. It runs on Node or Bun.
- Selection and recording are `nzyme git affected`'s, on Bun: select with
  `nzyme git affected-test-list --suite <name> --units <list.json> --out <file> --snapshot <file>`
  before the run, and after it record with
  `nzyme git affected-record --suite <name> --results <resultsFile> --snapshot <file> [--full]`.
- Servers read the label with `readTraceLabel(request.headers)` (`runtime/readTraceLabel.js`) and
  pass it to `traceScope`.
