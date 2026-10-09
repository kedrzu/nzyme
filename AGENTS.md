# Architecture

nzyme is a framework of `@nzyme/*` TypeScript packages. It is a Bun monorepo orchestrated by Nx, with
packages under `packages/*`. The runtime is Bun, not Node. Packages are published to npm, and product
monorepos also consume the repo as a git submodule, with `nzyme/packages/*` in their workspaces.

- **Core:** `utils`, `types`, `ioc`, `ioc-testing`, `logging`, `validation`, `crypto`, `money`,
  `i18n`, `i18n-core`, `i18n-compiler`, `rpc`, `openapi`, `fetch-utils`, `xml-utils`, `markdown`,
  `typography`
- **Vue:** `vue`, `vue-utils`, `vue-ioc`, `vue-forms`, `vue-i18n`, `vue-transitions`, `dom-utils`
- **Tooling:**
  - `cli` (the `nzyme` binary: `monorepo`, `localise`, `index`, `quiet-run`, `format-markdown`,
    `submodule`, `depcheck`)
  - `tsconfig`, `eslint` (also the oxlint preset), `oxlint` (custom rules), `project-utils`,
    `rollup-utils`, `nuxt-tools`, `esm`, `node-utils`, `vitest`
- **Integrations:** `aws`, `pulumi`, `slack`, `apis`
- **Private, never published:** `github-cli`, `linear`, `sentry-cli`, `logging-ui`

`bun run index` (also run by setup) generates a gitignored code map:

- the root `INDEX.md` lists packages;
- each package's `INDEX.md` lists its services, commands, endpoints, components and utils;
- `UTILS.md` catalogues the `@util` helpers of the foundational packages.

Read these before grepping, and check `UTILS.md` before writing a helper.

**Generated, never edit:** each package's `tsconfig.json` (`bun run monorepo`) and `*.loc.ts`
(`bun run localise`, from `.loc.yaml`).

## Lifecycle

This is a published library with several consumers.

- Every export of a public package is API. Renaming or removing one, or changing its behaviour, is a
  breaking change: commit it as `feat!:`/`fix!:` with a `BREAKING CHANGE:` footer.
- Product repos pin nzyme themselves (`docs/consumers.md`), so a change reaches them only after
  their own CI accepts it. Still, run their usages through your head before changing shared behaviour.

# Essential commands

Run from the repo root:

- `zsh setup.sh` — full setup. In a worktree it also catches up with the branch's base (`origin/main` or
  `origin/release`) and copies `.env`. `bash setup.build.sh` is the build half, shared with CI:
  install, `nzyme` CLI, generated files, all package builds.
- `bun run build --exclude=@nzyme/logging-ui` — Nx build of all packages, as CI runs it (the bare
  script includes `logging-ui`); `bun watch` rebuilds on change.
- `bun run typecheck` — `tsgo --build`.
- `bun run test` — all tests (`bun:test`); `bun test packages/<pkg>/src` for one package. Always run
  from the repo root, and use `bun run test`, not bare `bun test`, for the whole suite.
- `bun run lint` / `bun run lint:check` — oxlint (type-aware) plus ESLint for Vue.
- `bun run format` / `bun run format:check` — oxfmt plus `nzyme format-markdown`. Never hand-apply
  formatting.
- The lint and format configs here (`.oxlintrc.json`, `.oxfmtrc.json`, `eslint.config.mjs`) are
  nzyme's own, and they apply even inside a consuming repo. That repo excludes `nzyme/` and runs these
  scripts in place (`docs/consumers.md#lint-and-format`). Change rules here, never in a consumer.
- `bun run reinstall` — clean reinstall after dependency trouble.

## Keep command output out of context

Verbose output (build, test, lint logs) is the biggest token cost; a long log gets re-read on every
later turn. Wrap noisy commands in `bun nzyme quiet-run <command>`. It writes the full log to
`.context/cmd-logs/` and prints one line on success, or the error lines plus a tail on failure, with
the exit code passed through. Read a full log selectively (grep, a line range), never whole. Filter
one-off dumps at the source too (`git show --stat`, `--jq`, a path).

# Verification and the dev pipeline

- The **`verify`** skill (`.claude/skills/verify/SKILL.md`) owns verification: whether a change needs it,
  the scoped checks while iterating, and the full protocol before done.
- The **`git-workflow`** skill (`.claude/skills/git-workflow/SKILL.md`) owns branches, commits, PRs,
  hotfix bases and landing.
- Both are the contracts of the `dev` plugin (`/dev:fix`, `/dev:task`, `/dev:feature`, `/dev:build`,
  `/dev:deliver`), which is installed from the `kedrzu-skills` marketplace in `.claude/settings.json`.
- **Every implementation task reads `nzyme:code-conventions`**, plus the `nzyme:*` skill for the package
  it touches (`ioc`, `logging`, `translations`, `forms`, `composables`, `testing`). These skills ship from
  this repo in `plugins/nzyme/` and are what consumer repos install too, so fix them here when they are
  wrong.
- **ADRs** go to `docs/decisions/<title-slug>.md`, never numbered.

# TypeScript rules

These always apply. Everything else — organization, naming, casting, JSDoc, design principles — is in
`nzyme:code-conventions`.

- Import `.ts` files with a `.js` extension (ESM).
- Never use `any`; use proper types or `unknown`. Reaching for `any` or an ugly cast means something
  deeper is wrong: investigate, don't cast.
- Use `assert()` from `@nzyme/utils` instead of a non-null assertion (`!`) in production code (`!` is
  fine in tests).
- Never disable a lint rule to make an error go away; ask if stuck. A rule that is genuinely wrong for a
  case is disabled in config, or with a comment saying why.

# Publishing

Releases come from the `release` branch through a release PR (`docs/decisions/release-line-on-nx-release.md`).
The `git-workflow` skill covers what a contributor does. A new or changed public package must have:

- `publishConfig.access: "public"`, `license`, `repository`, and a `description`;
- `files` that contain every `exports`/`main`/`types` target. Most packages ship `dist`; `vue`,
  `vue-forms`, `vue-i18n` and `vue-transitions` ship `src`;
- internal dependencies as `workspace:*`, and no dependency on a private package.

`bun scripts/publish.ts --dry-run` checks only that no public package depends on a private one and
that no `workspace:` specifier survives packing (versions already on npm are skipped, not packed).

# Git

- **Conventional Commits are mandatory:** they drive the version and the changelog, and the PR title
  becomes the squash commit. Never edit `version` fields or `CHANGELOG.md` by hand.
- **Land every change you were asked to make:**
  1. Run the scoped checks.
  2. Commit and push through `git-workflow`. Never commit red.
  3. Before reporting done, confirm `git status --porcelain` is empty and `HEAD` equals `@{u}`.
     This governs finishing a change; it never licenses making one.
- **Stash safety:** stashes are shared across all worktrees, and other agents may be working in
  parallel. Never use bare `git stash`/`pop`/`apply`. Name the stash uniquely and restore it by ref. The
  `git:stash-safety` skill has the recipes.

# Diagnosing failures — check, don't assume

- **Read the real error first:** the failing assertion, the first error line of the log. Do this before
  reasoning about causes.
- **When everything fails, look for one shared cause** (a broken build, a missing generated file).
  Diagnose it on one fast case, not by re-running the suite.
- **Fix the whole class, not the instance:** once you know the mechanism, grep for every occurrence.
- **An implausibly fast green is not green:** a 0 s run, or a usage banner with exit 0, did not run
  anything.
- **Say "I don't know yet".** State hypotheses as hypotheses, and drop them plainly when evidence kills
  them.

# Writing style

This applies to everything you write: plans, PR descriptions, reviews, docs, chat replies.

- **Distill.** Every paragraph carries a fact, decision or instruction found nowhere else. No filler
  ("It is important to note…"), and don't restate the request.
- **Omit an inapplicable section rather than writing "N/A".** A table needs 3+ rows and 2+ varying
  columns; anything smaller is bullets.
- **Match the user's register.** Anything durable or read by agents (code, comments, docs, ADRs, skills,
  PRs) is English. A reply only the user reads is in their language.
- **Hub files stay thin.** `AGENTS.md` and a `SKILL.md` carry routing and rules; detail goes in the
  reference they point at.

# Agent tool use

- **Locate, then window:** grep or the index to find the range, then read it with offset/limit. Never
  re-read a file you already have, or re-read to verify your own edit.
- **Batch independent calls** in one message; serialize only on real dependencies.
- **Use absolute paths;** don't rely on `cd` persisting between shell calls.
- **Pick subagent tiers by the work:**
  - Haiku for mechanical search;
  - Sonnet for multi-hop or semantic exploration;
  - your own model for the reasoning.
    Escalate on a thin result rather than defaulting up.
