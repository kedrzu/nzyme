# @nzyme/affected

Selects the tests a change can affect: by the import graph since a base, and by **variants** — what a
test depended on when it last passed, with the hashes of that code. Bun only. The command is
`nzyme git affected` (`@nzyme/cli`); this package is its core. Why it is built this way:
`docs/decisions/file-level-affected-selection-by-full-import-scan.md` and
`docs/decisions/variant-based-test-selection.md`.

## Configuration

`nzyme.affected` in the root `package.json` (`base/AffectedConfig.ts`): `baseBranches`, `aliases`,
`rewrites`, `fullRunTriggers`, `ignore`, and `suites`:

```json
"suites": {
    "unit": { "patterns": ["packages/**/*.test.ts"], "fullRunTriggers": ["packages/db/src/schema/**"] },
    "e2e": { "patterns": ["packages/e2e/src/**/*.spec.ts"], "traced": true }
}
```

A suite's `fullRunTriggers` add to the global ones. A test with no matching variant runs: in a static
suite only when the base diff selects it, in a `traced` suite always.

## Modules

- `fingerprint/fingerprintFile.ts` — a file's `body` hash (outermost function bodies) and `top` hash
  (the rest), types and comments stripped; `.vue` split by block.
- `selector/openTestSelector.ts` — `select`, `record`, `invalidate` and `audit` for one suite.
- `store/VariantStore.ts` — the variants, in `<git-common-dir>/nzyme-affected/`, shared by every
  worktree of a clone; at most 20 per test.
- `junit/readJunitResults.ts` — per-file results of a bun test or Vitest JUnit report.
- `playwright/` — the Playwright test list and `TracedTestResult`, the line `@nzyme/trace`'s reporter
  writes for `nzyme git affected --record`.
- `base/` — selection by the import graph since a base.
