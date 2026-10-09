---
name: verify
description: >-
    Prove a change in nzyme works: the scoped checks to run while iterating and the full protocol that
    must be green before work is done (build, typecheck, lint, format, tests), fixing every failure.
    Use when asked to verify, make it green, fix failing checks, or before reporting code-impacting
    work complete. This is the dev plugin's `verify` contract — `/dev:*` runs Scoped after each task
    and Full once at the end.
---

# Verify

## Does this change need verifying?

- **Code-impacting** — anything that can change what is built, tested or published: source and tests,
  `package.json`/`bun.lock`, generated inputs (`.loc.yaml`), build/lint/format/test config, workflows
  that build or publish. → verify it.
- **Non-code-only** — docs, ADRs, agent instructions and skills. → run only the matching check
  (`bun run format:md:check` for markdown, `claude plugin validate . --strict` for the plugin, parse
  edited JSON). That is sufficient evidence; do not run the full protocol unless asked.
- Mixed or unsure → code-impacting.

## The laws

- **No completion claim without fresh evidence** from commands you ran in this session.
- **Every red is yours.** Do not sort failures into "mine" and "pre-existing" — make them green, or stop
  and ask when a fix is out of scope.
- **An implausibly fast green is not green** — a 0 s test run or a usage banner did not run anything;
  read the log.

## Keep output out of context

Wrap every check in `bun nzyme quiet-run <command>`: the full output goes to
`.context/cmd-logs/`, and you get one line on success or the error lines plus a tail on failure, with
the exit code passed through. Read a full log only selectively (grep, a line range). If `nzyme` is not
built yet (fresh clone), run `bash setup.build.sh` first.

## Scoped — after each task, while iterating

Fast, covers what you touched. Green here is not a green repo: a package build never compiles its
downstream consumers.

1. Build what changed and its dependents:
   `bun nzyme quiet-run bun nx affected -t build --base=origin/main --exclude=@nzyme/logging-ui`
2. Tests of the touched packages, always from the repo root:
   `bun nzyme quiet-run bun test packages/<pkg>/src` (a file path narrows further).
3. Lint the changed files, new untracked ones included (`git diff` alone lists only tracked paths):
   `{ git diff --name-only --diff-filter=d $(git merge-base origin/main HEAD) -- '*.ts' '*.tsx' '*.vue'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.vue'; } | xargs bun nzyme quiet-run bun x oxlint --type-aware --quiet`
   (on a hotfix branch use its base instead of `origin/main`)
4. Format: `bun run format` (oxfmt + markdown) — never hand-format.

Changed a `.loc.yaml`? Run `bun run localise` before building. Added or removed a package or an internal
dependency? Run `bun run monorepo` (regenerates the per-package `tsconfig.json`) and `bun install`.

## Full — once, when all work is done

CI's steps (`.github/workflows/ci.yml`) plus `typecheck`, in order; fix each failure before moving on,
and re-run from step 1 if a fix touched dependencies or generated inputs:

1. `bun nzyme quiet-run bash setup.build.sh` — install, nzyme CLI, generated tsconfigs and
   translations, all package builds.
2. `bun nzyme quiet-run bun run typecheck`
3. `bun nzyme quiet-run bun run lint:check` — fix with `bun run lint`; never disable a rule to pass.
4. `bun nzyme quiet-run bun run format:check` — fix with `bun run format`.
5. `bun nzyme quiet-run bun run test` — `bun run test`, not `bun test` (the bare form ignores the
   script).

Before calling it done, run `git status --porcelain`: generated files must not appear (they are
gitignored), and formatting fixes must be committed.

## Troubleshooting

- Phantom TypeScript errors → `bun x tsgo --build --clean && bun run typecheck`.
- Dependency weirdness after switching branches → `bun run reinstall`.
- A test passes locally but fails in CI with a git error → it relies on a global git identity; give the
  test repo its own `user.name`/`user.email`.
