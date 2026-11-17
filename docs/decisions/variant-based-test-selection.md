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

> **Measured 2026-11-16 on healed** (`.context/trace-spike/` there): the e2e stack loads 717 modules; the
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

- **Fingerprint.** Types and comments are stripped before hashing, so a type-only change selects
  nothing; a file that fails to parse counts as changed in full. In `.vue`, the template, `<script setup>`
  and styles are body, a plain `<script>` is top. Non-code dependencies (images, fonts) are hashed whole.
- **Variant** = the test's entry files (hashed whole), the executed files (`body` + `top`), their static
  import closure (`top`; a literal `import('…')` is not followed — a lazily loaded module the test
  reached is an executed file itself, and following a router's lazy routes would tie every test to
  every page), its assets, and a suite fingerprint: the suite's `fullRunTriggers` and everything they
  import, the files that ran at startup, modules imported for side effects only, and files with a
  computed `import(…)`. A suite fingerprint that no longer matches reruns the whole suite.
- **Selection.** A test is skipped when any variant matches. A static suite's test with no variant falls
  back to the base diff; a traced suite's test with no variant runs. Only a pass records; a failure
  invalidates the variants matching the current code, so the test runs until it passes. A record is
  refused when a file the test depends on changed during the run.
- **Store.** `<git-common-dir>/nzyme-affected/v<N>/<suite>/<hash(unit)>/<variant>.json`, written
  atomically, at most 20 variants per test (the least recently matched go first). It is shared by every
  worktree of a clone, which is safe because a variant depends on content only, never on a branch. A
  corrupt or other-version store reads as no variants. The in-process hash cache is keyed by
  path, mtime and size and never shared: two worktrees can hold different content under the same key.
- **Bun-only core, recording in the CLI.** Fingerprinting uses `Bun.Transpiler`, so `@nzyme/affected`
  runs on Bun. Playwright's runner and reporters run on Node, so the reporter only writes a results file;
  `nzyme git affected --record` records it against the selection snapshot taken before the run.
- **Self-check.** `--full` runs everything, selects anyway and reports a failed test the selection would
  have skipped as a tracing gap.

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
