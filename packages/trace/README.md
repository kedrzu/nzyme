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

## Labels

Infrastructure code, not domain code, carries the label:

- `traceScope(label, fn)` (`runtime/traceScope.js`) — at every entry point (HTTP request, WebSocket or
  queue message), with the label read from the input.
- `currentTraceLabel()` — to put the label on an outgoing message.
- `markReady()` — once the process serves requests; what ran before is startup code.

All three do nothing without the probe. A label reaches Effect fibers started in its scope and the
async work they await, and a fiber started outside any label (a startup loop, a poller) stays
unlabelled. The probe has no Effect integration: Effect 4 itself carries the AsyncLocalStorage
context of a fork into the fiber and every resumption. `checkEffectLabelPropagation({ Effect, Fiber,
Queue })` proves that for the `effect` version you pin; run it in a test process started with the
probe.

## Trace files

One NDJSON file per process and thread, `<pid>-<threadId>.ndjson`; the line types are `TraceLine` in
`TraceLine.ts`.

## Playwright

`@nzyme/trace/playwright/*` writes, per test, what the traced servers and the test's browsers ran,
for `nzyme git affected --record` to store as the variants of `@nzyme/affected`.

- `traceTest` (`playwright/traceTest.js`) — re-export it as the suite's `test` and set
  `use: { nzymeTrace: { apps } }` (`TracedApp`: the app's origin, its source `public/` and the built
  output it serves, with source maps). Each context of a test, including one the test creates with
  `browser.newContext()`, sends the test's label in the `x-nzyme-trace` header and the `nzyme-trace`
  cookie for `localhost`; Chromium's JavaScript coverage of its pages, mapped through the bundles'
  source maps, and the `public/` files they fetched are attached to the result. A Node-side client
  sends `getTestTraceLabel(test.info())`. Chromium is launched without the features that swap the
  renderer on navigation, which would drop the coverage of the page before.
- `TraceReporter` (`playwright/TraceReporter.js`, default export) —
  `['@nzyme/trace/playwright/TraceReporter.js', { resultsFile, traceDir, ownsServers }]`. Once every
  process that reported `ready` has flushed past a test's end, it appends the test's line to
  `resultsFile` (`TracedTestResult` of `@nzyme/affected`): failed, passed with an incomplete trace and
  the reason (`no-heartbeat`, `stale-build`, `unprobed`, …), or passed with what it executed — the
  servers' files (`executed`) apart from the browser's (`browserExecuted`), because `--record` hashes
  a file any server ran in the run in full in every variant that imports it — its assets and the
  run's startup code. A build is stale when a built file the test ran was not built from
  its source's current content: the source map's `sourcesContent` differs, or, without it, the
  `tsgo` build info's hash of the source does; an asset is compared by modification time. With `ownsServers: false` it writes nothing. `traceDir` must be
  fresh per run. It runs on Node or Bun.
- Recording is `nzyme git affected`'s, on Bun: select with
  `--suite <name> --units <list.json> --test-list-out <file> --snapshot <file>` before the run, and
  after it record with `--suite <name> --record <resultsFile> --snapshot <file> [--full]`.
- Servers read the label with `readTraceLabel(request.headers)` (`runtime/readTraceLabel.js`) and
  pass it to `traceScope`.
