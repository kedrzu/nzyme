# Variant-based test selection

## Status

Accepted

## Context

`nzyme git affected` selects tests whose import graph reaches a file changed since the base
(`file-level-affected-selection-by-full-import-scan.md`). Two cases it cannot serve:

- **E2E.** A spec reaches the code through a browser, HTTP, WebSocket and queues, not imports, so the
  graph says nothing and the suite always ran in full — the longest step of a consumer's verification,
  growing with the number of tests rather than the size of the change.
- **Reruns on identical code.** While a branch is iterated on, every test affected since the base runs
  on each call, although most of them already passed on exactly this code.

The idea: record, from a passing run, what a test depended on together with the hashes of that code — a
**variant** — and skip the test while one of its variants matches the current code. A static suite
(unit, stories) takes the dependencies from the import graph; a traced suite (e2e) from what the
`@nzyme/trace` probe saw the test execute. The open questions are what to hash and where to keep it.

> **Measured 2026-11-16 in a spike on a consuming project**: the e2e stack loads 717 modules; the
> files the widest test (`journeys/consultation.spec.ts`) executed, plus everything they import, cover
> 557 of them (78%). Loading a module is not using it: at startup every module's top level runs, but
> function bodies run only when a test needs them.

> **Measured 2026-11-16 on healed's history:** of the last 150 PRs on `main`, 29 changed code the e2e
> stack loads. 2 changed only function bodies, 8 only imports or new files, 17 top-level code (endpoint
> and command definitions with their schemas, env and config modules).

> **Simulated 2026-11-16** on those 29 PRs for the consultation test with the rules below: 10 skip it, 6
> run it, 13 run the whole suite — infrastructure and env changes.

> **Measured 2026-11-16:** stripping types with `Bun.Transpiler` and parsing with `oxc-parser` takes
> 1.3 s for healed's 2,670 `src/` files, with no parse error.

## Options Considered

- **One hash per file.** A test depends on every file it executed and every file those import. Trade-off:
  simplest, but the import closure covers 78% of the stack, so almost any change reruns the test.
- **Two hashes per file:** `body` (the outermost function bodies) and `top` (the rest, bodies replaced by
  `{}`). Executed files carry both; files only in their import closure carry `top`. Trade-off: a body
  change selects only the tests that ran the file, a top-level change the tests whose executed files
  import it; costs a parser and a `.vue` splitter.
- **The same, with any top-level change rerunning the whole suite.** Trade-off: no closure in the
  variant, but 17 of 29 PRs (about 60%) would run everything.
- **One hash per function.** Trade-off: the most selective, but the trace grows from files to functions,
  and a function's identity across edits (anonymous, renamed, moved) is unstable — while body-only
  changes were 2 of 29 PRs, so the gain over two hashes per file is small.

## Decision

Two hashes per file, in `@nzyme/affected`.

- **Fingerprint.** Types and comments are stripped from scripts before hashing, so a type-only change
  selects nothing; a file that fails to parse counts as changed in full. In `.vue`, the template,
  `<script setup>`, scoped/module styles and custom blocks are body, hashed by text with whitespace
  normalised, so comments count; a global `<style>` and the import specifiers of `<script setup>` act at
  load and are top; a plain `<script>` is split like a module. Stylesheets are hashed by text with
  whitespace normalised. Non-code dependencies (images, fonts) are hashed whole.
- **Lockfile.** A `bun.lock` is hashed by what it installs from outside the workspace
  (`fingerprintBunLock()`), in variants and in the base diff alike: the lockfile without its
  `workspaces` section and without the `packages` entries resolved to `workspace:`. Those parts hold
  each workspace package's version, `bin` and dependency ranges, which its own `package.json` carries
  too, and that manifest is already a dependency of every test of the package. So a consumer's bump of
  the nzyme submodule, which rewrites every `@nzyme/*` version in `workspaces`, is no full run. The
  rest counts, a key a later format adds included: the external `packages` entries (resolution,
  dependencies, integrity), `overrides`, `patchedDependencies` (the patch files are separate
  triggers), `trustedDependencies` (whose install scripts run), catalogs, `lockfileVersion` and
  `configVersion` (bun's install defaults, such as the linker). A list of what to drop rather than of
  what to keep, so an unknown key errs towards a rerun. An install stamp a consumer writes for its
  `node_modules` hashes the same fingerprint, so the two cannot disagree about a workspace-only change.
- **Manifest.** A `package.json` standing for its package — in a variant as the manifest of the
  test's files, and in the base diff — is hashed by the part that decides what the package's code
  loads and how it runs (`fingerprintPackageJson()`): the manifest without `version`, `scripts`,
  `devDependencies`, `private` and the publishing metadata (`description`, `keywords`, `files`,
  `publishConfig`, `repository`, `license`, `author`, `contributors`, `homepage`, `bugs`,
  `funding`). So a release that raises every `@nzyme/*` version reruns nothing. A list of what to
  drop, so an unknown field errs towards a rerun. The fingerprint stores that part as `top` and the
  whole file as `body`, and every other holder of the file takes it whole: a test that imports the
  manifest or reads it through `fs` (a CLI printing its version), a listing of the package's
  non-code files (an untraced or opaque run), and a full-run trigger, in the suite fingerprint and
  in the base diff alike — a trigger means any change runs everything. That keeps the root
  `package.json`, which holds the `nzyme` config, the scripts that launch the suites and the
  repo-wide dev dependencies, a byte-for-byte trigger. A script that launches a suite from a
  package's own manifest (a `test` script run through `bun run --cwd`) is not seen by the package's
  fingerprint: list that manifest among the suite's `fullRunTriggers`.
- **Variant** = the test's entry files (hashed whole), the executed files (`body` + `top`), their static
  import closure (`top`, except a file a server process ran in the same run, below), the modules with
  no function — constants, a data table, config, JSON — that a loaded file (an executed file, one in
  that closure, or such a module itself) loads through a literal `import('…')`, with their static
  imports (`top`: the trace sees only functions, so all of such a module's code runs unseen), its
  assets, the
  `package.json` of every workspace package owning one of its files (`top`, the part above; a manifest
  edit acts on the whole package, as on the base-diff path), and a suite fingerprint: the suite's `fullRunTriggers` and everything they
  import, the files that ran at startup, modules imported for side effects only, and files with a
  computed `import(…)`. A lazily loaded module with functions is not followed: if the test reached
  it, a function in it ran and it is an executed file itself, and following a router's lazy routes
  would tie every test to every page. The trace records files, not functions, so from an executed
  file a module with no function is followed even when the function holding its `import()` did not
  run for the test: a dependency too many, the safe direction. A file that only loaded ran its
  load-time code and none of its functions, so it counts by the `import()`s outside every function
  body (the fingerprint's `loadImports`); one inside a function of it creates no dependency. A suite fingerprint that no longer matches reruns the whole suite; its config
  hash covers the triggers, tracing, aliases and `rewrites`. A trigger with no glob character names one
  file that counts while it exists even when git ignores it, so an install or build stamp can be one.
  The variant graph links each rewrite target to its source (`x.loc.ts` imports `x.loc.yaml`), so a
  generated module's source is a dependency.
- **Inputs no import shows.** A test reads fixtures through `fs`, or loads modules through a computed
  `import()` (``import(`./actions/${file}`)`` over a `readdir`). Neither the graph nor the trace sees
  them, and the base diff's answer — a changed un-imported file seeds its whole package — applies only
  to a test with no variant. So a variant also holds, in full, every file with no import source kind
  of each package owning one of its files (minus `ignore`), and every file under the directory of a
  file with a computed `import()` — in a static suite with what those import too. Each such set is
  stored as the digest of its sorted file list, so a fixture or a module added or removed is a change.
  A read reaching into another package (a test reading every package's manifest) is not seen this
  way, so a static suite's run traces its `fs` reads instead: `@nzyme/trace/fs-preload`, the runner's
  first preload, wraps the reading functions of `node:fs`, `node:fs/promises` and `Bun.file`/`Bun.Glob` (patched
  through `process.getBuiltinModule` and re-synced into the named imports, which only reaches modules
  that import `node:fs` after it) and attributes each access to `Bun.main`, the test file `bun test`
  is running. A traced test's variant holds the walked files it read, whatever `ignore` says, and the
  entry list of each directory it read, instead of its packages' un-imported files, plus its snapshot
  file, which `bun test` reads natively. A missing file and one outside the walk (`node_modules`, a
  gitignored build) are not inputs. Writes are not traced: a test that reads a walked file it wrote
  itself depends on it. What it cannot see — a child process, a worker, the Bun shell (`Bun.$`),
  `Bun.build`, a recursive `cp`, a native addon — keeps the package listing: a test that does any of
  those is marked opaque. Every `bun test` file shares one process, so a module that read a file once
  and kept what it read — a memo, a cache, a read at load time — serves later test files without
  touching the disk, in whatever order they run. So each access also names its reader, the innermost
  stack frame's file outside `node_modules` (a built file mapped to its source through the single
  source of its source map), and a variant takes, besides its own reads, what every module it loads
  read anywhere in the run. An access with no such frame goes to every test; a process a package starts
  from its own callback (`simple-git`, `execa`) has none, so a run that includes such a test keeps
  the package listing for every test. Capturing the reader cost nothing measurable against
  run-to-run noise on 180 healed and 29 nzyme test files. A package's own cache
  reached through two modules is credited to the first only: crediting each package's accesses to
  every test would hand every `fs-extra` and `graceful-fs` read in the run to every test.
  Sharing every read with every test instead was measured and rejected: one test reading 947 source
  files, and another every package manifest, would make about two in three commits rerun everything.
  An access a test leaves running past its file goes to the next file, which only adds an input. Tracing module loading as well would replace the computed-`import()` listing; it was
  not needed yet.
- **Builds.** The import graph resolves a workspace package's imports to its sources, but Bun and
  Vitest load the package's build. A static run on a stale build would record a variant hashing sources
  that did not run, and the test would then be skipped while they stay unchanged. So a static record
  checks every file loaded across a package boundary (and all that is reached from it) against the
  TypeScript build infos of its package — `tsgo` records the XXH3-128 of each source's text — and is
  refused when a build info lists the file with another version. A file no build info lists (a `.vue`
  file) runs from source. A traced run proves the same through the probe's own build check.
- **Code that runs once in a server.** A long-lived server serves every test, so code that runs once
  and keeps state — a lazy singleton's setup, a memo, a cache — runs only in the first test that needs
  it, and later tests that use what it built never execute it. A mutation campaign found a body change
  to such code selecting 1 of the 34 tests it broke (an AWS client's setup), and 1 of 10 (another). So
  a closure file that any server process executed anywhere in the run, in any test, gets `body` too.
  Browser execution does not count: every test gets a fresh browser context, so browser state never
  crosses tests; the reporter keeps the two apart for this. Measured on 92 recorded e2e variants, both
  mutations then select every test they break (34 and 11 tests), and a single-file historical edit
  selects 27.3 tests on average instead of 22.8. Startup files need nothing extra: the suite
  fingerprint holds them in full.
- **Selection.** A test is skipped when any variant matches. A traced suite's test with no variant runs.
  A static suite's test with no variant runs when the suite's triggers changed (the selection reports a
  full run): a dependency update must never let a test skip, and once the update is committed, pulled
  or checked out the base diff no longer sees it. Otherwise it falls back to the base diff. Only a
  pass records; a failure invalidates the variants matching the current code, so the test runs until
  it passes. One failed attempt outweighs any passed ones of the same run (retries, repeats), so a
  flaky test is not skipped on its lucky attempt, and a run that lost its selection snapshot still
  invalidates for its failures. Remembering a failure across runs, so that a later pass on the same
  code would not record either, was not taken: a failure is almost always followed by a code change
  that no longer matches it, so it would guard only reruns of unchanged code, at the cost of a new
  kind of record. A record is refused when a file the test depends on changed during the run, or when a
  static test ran on a stale build.
- **Store.** `<git-common-dir>/nzyme-affected/v<N>/<suite>/<hash(unit)>/<variant>.json`, written
  atomically, at most 20 variants per test (the least recently matched go first). It is shared by every
  worktree of a clone, which is safe because a variant depends on content only, never on a branch. A
  corrupt or other-version store reads as no variants. The in-process hash cache is keyed by
  path, mtime and size and never shared: two worktrees can hold different content under the same key.
- **Bun-only core, recording in the CLI.** Fingerprinting uses `Bun.Transpiler`, so `@nzyme/affected`
  runs on Bun. Playwright's runner and reporters run on Node, so the reporter only writes a results file;
  `nzyme git affected-record` records it against the selection snapshot taken before the run.
- **Self-check.** A traced run under `nzyme git affected-record --full` runs everything, selects anyway and reports a
  failed test the selection would have skipped as a tracing gap. A static suite has none: its full run
  goes around the selection.

How a traced test's execution is attributed to it is the consumer's decision (healed:
`docs/decisions/e2e-test-attribution-by-label-and-time-window.md`); keeping the trust it relies on
honest is `module-state-declared-by-no-side-effects.md`.

## Consequences

- An unchanged rerun runs nothing, and e2e scales with the change instead of the suite.
- Correctness comes before selectivity: an input the trace cannot see must be a `fullRunTriggers` entry,
  and a run that cannot prove its trace complete (no probe, a stale build, a process that did not flush)
  records nothing rather than something partial.
- The first run on a clone, and every run after the store's format version changes, runs everything.
- The store is local; CI neither reads nor writes it, and without `--suite` the command behaves as before.
