# Dependency Health

Last full review: 2026-10-26

Direct dependencies of nzyme's packages that were deprecated, renamed or abandoned, found by the
registry `deprecated` check or the monthly full review of `/dev:update-packages`. The update run never
migrates one; it raises each finding until the owner decides. One `###` per package (a family reviewed
as one unit gets one entry) with the fields below. A decided finding is raised again only when its
situation changes; a `pending` one goes into every run report. Delete an entry once the package is gone
from every `package.json`.

- **Signal**: the npm deprecation message quoted, an archived repo, a README notice — with a link
- **Successor**: the package that replaces it, or none
- **Used in**: the packages that declare it
- **Decision**: `pending` | `keep` — why | `migrate` — the tracker issue

## Findings

### @typescript/native-preview

- **Signal**: its staging repo `microsoft/typescript-go` is **archived** (`gh api repos/microsoft/typescript-go --jq .archived` → `true`, last push 2026-08-31) and the package has not published since 2026-07-07 — `latest` is still `7.0.0-dev.20260707.2`. Its README says it "will eventually be replaced by the official TypeScript package" and that TypeScript 7.0 RC and later should use `tsc`.
- **Successor**: `typescript` 7.x, which ships the native compiler as `tsc`.
- **Used in**: the root plus every workspace — this is `tsgo`, the whole typecheck.
- **Decision**: **keep**, with a dated re-check — it is being superseded on schedule, not abandoned under us. Checked upstream on 2026-10-26: TypeScript 7.0 ships **no programmatic API at all, deliberately**, and Microsoft names running 7.0 side-by-side with 6.0 as the intended arrangement "for utilities that still need some programmatic access to the compiler (such as typescript-eslint)". That is precisely our setup. The real target is **7.1**, which carries the new API and content mappers, and is published as `typescript@7.1.0-beta` with daily nightlies. Both tools that block us are building against it in the open: typescript-eslint in [PR #12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803) (open, non-draft, 125 files) and Volar in [PR #6170](https://github.com/vuejs/language-tools/pull/6170) (draft, actively pushed). A frozen dev dependency that still compiles costs nothing, and `tsgo` is green across the whole protocol. The three re-check conditions live in `docs/package_update.md` → `typescript 7.x`. Revisit when all three clear; do not open a migration task before then.

### s3-sync-client

- **Signal**: repo `jeanbmar/s3-sync-client` is archived; its README reads "This repository is now archived. Consider using [Mountpoint for Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint.html) instead." Last release 4.3.1, 2023-07-03.
- **Successor**: none as a library. Mountpoint is a filesystem mount, not an npm package; a replacement would be a small in-house sync over `@aws-sdk/client-s3`.
- **Used in**: `@nzyme/aws`
- **Decision**: pending

### typescript-vue-plugin

- **Signal**: last published 2023-12-26, no README. The same repo (`vuejs/language-tools`, actively pushed) now publishes `@vue/typescript-plugin`, at 3.3.13.
- **Successor**: `@vue/typescript-plugin`
- **Used in**: `@nzyme/tsconfig` (the manifest and the plugin entry in `vue.json`)
- **Decision**: pending

### vite-plugin-dts

- **Signal**: the npm README opens "(Do not recommend anymore, please use `unplugin-dts` instead)". Development moved to `qmhc/unplugin-dts`, pushed 2026-10-03.
- **Successor**: `unplugin-dts`
- **Used in**: `@nzyme/rollup-utils`
- **Decision**: pending

### depcheck

- **Signal**: repo `depcheck/depcheck` is archived (last push 2025-02-27); `latest` is 1.4.7.
- **Successor**: none official; `knip` is the usual replacement.
- **Used in**: `@nzyme/cli` (the `nzyme depcheck` command) and per-package `depcheck` config blocks
- **Decision**: pending

### source-map-support

- **Signal**: README: "This package is no longer required as Node 12.12.0 introduced the `--enable-source-maps` flag". Last commit 2022-11, last publish 2023-06; issues and a security PR from 2025–2026 are unanswered.
- **Successor**: Node's `--enable-source-maps`; Bun maps source maps itself.
- **Used in**: `@nzyme/cli`, `@nzyme/rollup-utils` (plus `@types/source-map-support`)
- **Decision**: pending

### lodash.debounce / lodash.merge

- **Signal**: lodash's own guidance on per-method packages — "use of these packages is discouraged and they will be removed in v5" (https://lodash.com/per-method-packages). Last publishes 2022-06 and 2023-06; the per-method CVE issue (lodash/lodash#6106) is still open. Core `lodash` and `lodash-es` remain active.
- **Successor**: `lodash-es`.
- **Used in**: `lodash.debounce` — `@nzyme/dom-utils`, `@nzyme/vue`, `@nzyme/vue-utils`; `lodash.merge` — `@nzyme/cli` (plus both `@types/*`)
- **Decision**: pending

### enquirer

- **Signal**: last commit and release 2023-07; 207 open issues, and Ctrl+C crash PRs from 2026-01 and 2026-03 have had no maintainer response.
- **Successor**: none adopted; `@clack/prompts` and `@inquirer/prompts` are the usual alternatives.
- **Used in**: `@nzyme/cli`, `@nzyme/github-cli`, `@nzyme/linear`
- **Decision**: pending — warning signs only, still functioning.

### postal-codes-js

- **Signal**: last commit 2020-10, last publish 2022-06; contributor PRs from 2023–2025 are uncommented. Its postal-code data is hand-maintained, so it goes stale rather than merely standing still.
- **Successor**: none identified
- **Used in**: `@nzyme/validation`
- **Decision**: pending — warning signs only.

### remark-behead

- **Signal**: last release 2022-06, last push 2023-01, with an unanswered 2023 report about `require()` of an ES module (mrzmmr/remark-behead#19). Not archived, no unmaintained notice.
- **Successor**: none
- **Used in**: `@nzyme/typography`
- **Decision**: pending — watch only.

### Not findings, recorded so a later review does not re-raise them

- **The big families** — `@aws-sdk/*`, `@pulumi/*`, `@slack/*`, `@vitest/*`, `@rollup/*`, the unified/remark/mdast set, the Vue and Nuxt cores — are all on their current generation and actively released.
