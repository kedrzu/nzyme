# Architecture

nzyme is a framework of `@nzyme/*` TypeScript packages. It is a Bun monorepo orchestrated by Nx, with
packages under `packages/*`. The runtime is Bun, not Node. Packages are published to npm, and product
monorepos also consume the repo as a git submodule, with `nzyme/packages/*` in their workspaces.

- **Core:** `utils`, `types`, `ioc`, `ioc-testing`, `logging`, `validation`, `crypto`, `money`,
  `i18n`, `i18n-core`, `i18n-compiler`, `rpc`, `openapi`, `fetch-utils`, `xml-utils`, `markdown`,
  `typography`, `config` (the typed config document and its sources), `secrets` (secret stores loaded into env variables, and the `secrets` commands)
- **Vue:** `vue`, `vue-utils`, `vue-ioc`, `vue-forms`, `vue-i18n`, `vue-transitions`, `dom-utils`
- **Tooling:**
  - `cli-core` (the clipanion-based `Command` framework behind every CLI), `cli` (the `nzyme` binary: `monorepo`, `localise`, `index`, `quiet-run`,
    `submodule`, `depcheck`, `git affected`, `git base`)
  - `pen` (Pen design files in git: the document model and the `pen` commands)
  - `tsconfig`, `eslint` (also the oxlint preset), `oxlint` (custom rules), `project-utils`,
    `rollup-utils`, `nuxt-tools`, `esm`, `node-utils`, `vitest`
- **Integrations:** `aws`, `pulumi`, `slack`, `apis`, `bitwarden` (a Secrets Manager store for `secrets`)
- **Private, never published:** `github-cli`, `linear`, `sentry-cli`, `logging-ui`

`bun run index` (also run by setup) generates a gitignored code map:

- the root `INDEX.md` lists packages;
- each package's `INDEX.md` lists its services, commands, endpoints, components and utils;
- `UTILS.md` catalogues the `@util` helpers of the foundational packages.

Read these before grepping.

**Generated, never edit:** each package's `tsconfig.json` (`bun run monorepo`) and `*.loc.ts`
(`bun run localise`, from `.loc.yaml`).

## Lifecycle

This is a published library with several consumers.

- Every export of a public package is API. Renaming or removing one, or changing its behaviour, is a
  breaking change: commit it as `feat!:`/`fix!:` with a `BREAKING CHANGE:` footer.
- Product repos build nzyme as a submodule (`docs/submodule-setup.md`) and pin it themselves
  (`docs/consumers.md`), so a change reaches them only after their own CI accepts it. Still, run their
  usages through your head before changing shared behaviour.

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
- `bun run test:components` — Vue component tests (`*.spec.ts`) in Vitest browser mode, headless
  Chromium; `bun test` never collects them. First run: `bun x playwright install chromium` in the
  package.
- `bun run lint` / `bun run lint:check` — oxlint (type-aware) plus ESLint for Vue,
  `package.json` and Markdown (`lint` formats Markdown).
- `bun run format` / `bun run format:check` — oxfmt (Markdown is ESLint's, above). Never hand-apply
  formatting.
- The lint and format configs here (`.oxlintrc.json`, `.oxfmtrc.json`, `eslint.config.mjs`) are
  nzyme's own, and they apply even inside a consuming repo. That repo excludes `nzyme/` and runs these
  scripts in place (`docs/submodule-setup.md#lint-and-format`). Change rules here, never in a consumer.
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
- **Every implementation task reads `docs/practice/code-conventions.md`**, plus the practice document
  for its area, `docs/practice/<area>.md`: `ioc`, `logging`, `testing`, `ui`, `composables`, `forms`,
  `translations`, `drizzle`, `api-clients`, `secrets`, `design`. Consumer repos inline the same documents into
  their own skills, so fix the text there when it is wrong.
- **The `nzyme` plugin** (`plugins/nzyme`) ships only `/nzyme:architecture`, which sets up or updates a
  product repo and compares its skills against the practice documents.
- **ADRs** go to `docs/decisions/<title-slug>.md`, never numbered.

# TypeScript rules

These always apply. Everything else — organization, naming, casting, JSDoc, design principles — is in
`docs/practice/code-conventions.md`.

- Reaching for an ugly cast means something deeper is wrong: investigate, don't cast.
- Use `assert()` from `@nzyme/utils` instead of a non-null assertion (`!`) in production code: `!` gives
  no runtime check (it is fine in tests).
- Never disable a lint rule to make an error go away; ask if stuck. A rule that is genuinely wrong for a
  case is disabled in config, or with a comment saying why.

# Publishing

Releases come from the `release` branch through a release PR (`docs/decisions/release-line-on-nx-release.md`).
The `git-workflow` skill covers what a contributor does.

`bun run lint:check` enforces, on every non-private `package.json`: `license`, `description`,
`repository`, `publishConfig.access: "public"`, and `files` covering every `exports`/`main`/`types`
target (`source` targets excepted). The rules are in `eslint.config.mjs` and `@nzyme/eslint`.

Not linted:

- internal dependencies as `workspace:*`, and no dependency on a private package;
- external dependencies as ranges (`^`), never exact pins: the product's lockfile chooses the version.

Framework singletons (instances or types shared with the consumer, or the host of a plugin/preset:
`vue`, `vue-router`, `@pulumi/*`, `nuxt`, `vite`, `rollup`, `vitest`, `eslint`) are
`peerDependencies`, with the same range repeated in `devDependencies` (the submodule consumer installs
dev dependencies too, so a different specifier makes a second copy).

- Raise a range's lower bound only when the code needs the newer version, not because one exists.
- Moving a range to a new major is a breaking change: `feat!`/`fix!` with a `BREAKING CHANGE:` footer.
- `checkDependencyRanges()` in `scripts/publish.ts` enforces this and runs in `bun run test`.

`bun scripts/publish.ts --dry-run` checks that the ranges hold, that no public package depends on a private one and
that no `workspace:` specifier survives packing (versions already on npm are skipped, not packed).

# Git

- **Conventional Commits are mandatory:** they drive the version and the changelog, and the PR title
  becomes the squash commit. Never edit `version` fields or `CHANGELOG.md` by hand.
- **Land every change you were asked to make:**
  1. Run the scoped checks.
  2. Commit and push through `git-workflow`. Never commit red, and never ask for permission to commit or
     push: authorization to make the change is authorization to land it.
  3. Before reporting done, confirm `git status --porcelain` is empty and `HEAD` equals `@{u}`.
     This governs finishing a change; it never licenses making one.

# Diagnosing failures — check, don't assume

Get direct evidence before naming a cause. A plausible story about why something broke is worse than none:
it sends you fixing the wrong thing, and every wrong fix costs another verify cycle.

- **Read the real error first:** the failing assertion, the browser console, the first error line of the
  log, the resource that is supposedly missing. A timeout or a dot-reporter run describes a symptom; the
  underlying error usually names the problem. Use the tool that shows the actual state instead of
  inferring it.
- **When everything fails, look for one shared cause:** 35 of 35 e2e specs failing is one broken app
  boot, not 35 broken tests. Diagnose it on one fast case, not by re-running the suite.
- **Fix the whole class, not the instance:** once you know the mechanism, grep for every occurrence and
  handle them together. Finding the second one with another full run is the expensive path.
- **An implausibly fast green is not green:** a 0 s run, or a usage banner with exit 0, did not run
  anything. Check the log before believing a pass.
- **Say "I don't know yet".** State hypotheses as hypotheses, and when evidence kills one, say so plainly
  rather than sliding to the next guess.

# Writing style

This applies to everything you write: plans, PR descriptions, issues, reviews, docs, chat replies.
Templates say which sections to include; they never license length. Each rule has a check to run on your
draft.

- **Distill.** Check: every paragraph carries a fact, decision or instruction found nowhere else.
- **No filler** ("It is important to note…", "In conclusion…"). Check: delete the phrase; if the rest
  still reads, it was filler.
- **Don't restate the request.** Check: if the opening can go without losing anything the reader doesn't
  already know, cut it.
- **Omit an inapplicable section rather than writing "N/A".** Check: no "N/A", "None" or "TBD" bodies.
  The exception is a section whose emptiness is the information ("asked and closed"), and only where its
  template says so.
- **A table earns its syntax:** 3+ rows and 2+ varying columns. Check: a 2-row table is two bullets.
- **Name only what the reader has seen.** A label from your own working context (`D41`, "variant B", a
  term you coined) is noise to someone who was not inside it. Check: every ID or term is explained in the
  same sentence, or is something the reader wrote.
- **Match the user's register.** Check: if it reads like a press release and the user writes like an
  engineer, rewrite it.
- **Write in the reader's language.** Anything durable or read by agents (code, comments, docs, ADRs,
  skills, PRs, issues) is English; a reply or plan only the user reads is in their language. Technical
  terms stay English in both. Check: who opens this next?
- **Hub files stay thin.** `CLAUDE.md` and a `SKILL.md` carry routing and rules; detail goes in the
  reference they point at. Check: a paragraph not needed on every invocation belongs one level down.

# Agent tool use

- **Locate, then window:** grep or the index to find the range, then read it with offset/limit.
- **Pick subagent tiers by the work;** the default inherits your model, which is too expensive for
  fan-out:
  - Haiku for mechanical search;
  - Sonnet for multi-hop or semantic exploration;
  - your own model for the reasoning.
    Escalate on a thin result rather than defaulting up.
