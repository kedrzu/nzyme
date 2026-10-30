# Setup scripts

One command takes a fresh clone or a new worktree to a built, testable workspace, and CI runs the
build half of that same command. Paseo runs it for every worktree it cuts.

## Reference state

- **`setup.sh`** (zsh) — `assets/setup.sh.tmpl`. Everything for a person or a worktree, in order:

  1. **bun floor:** fails when the local bun is older than `packageManager`; newer passes. The
     version has one home, `package.json`.
  2. **Worktree catch-up** (worktrees only, never CI or the main checkout): finds the branch's base —
     the open PR's, else the one Paseo recorded in `<git-dir>/paseo/worktree.json` — and only when it is
     `main` merges `origin/main` in. A stacked node never takes `main`: it would drag `main` into a PR
     that does not target it. The local `main` is fast-forwarded too, so the next worktree is not cut
     from a stale one. A conflicting merge is aborted and reported, never left half-done.
  3. **Local files** (worktrees only): copies `CLAUDE.local.md`, `.claude/settings.local.json`, and
     `.env`/`.env.*` at the root and in each package from the main checkout. Never overwrites, skips
     `*.example`. Add a technology's local secrets to the loop (`packages/*/.dev.vars(N)` for
     Cloudflare Workers).
  4. **Submodule checkout** (not in CI): `references/submodule.md`.
  5. **`bash setup.build.sh`.**
  6. **`bun run index`**, non-fatal: the code map is for agents, so CI skips it and a failure only
     warns.

  Every skipped step is warned about when it happens and again at the end.
- **`setup.build.sh`** (bash) — `assets/setup.build.sh.tmpl`. Only what compiling and testing needs,
  no credentials and no local infrastructure: install (`--frozen-lockfile` in CI), the nzyme CLI,
  `monorepo` and `localise`, `tsgo --build` (the order: `docs/submodule-setup.md#build`), then
  `nuxt prepare` when there is a Nuxt app and the Playwright Chromium when there are browser tests.
  bash because GitHub-hosted runners have no zsh. CI runs exactly this file, so a local build proves
  what CI proves.
- **`paseo.json`** — `assets/paseo.json.tmpl`: `worktree.setup` runs `zsh setup.sh`;
  `metadataGeneration` tells Paseo how to name branches, commits and PRs. Add `worktree.teardown`
  only when a worktree owns outside state (its own database, a deployed stack); cleanup that must
  not fail goes first. Add `scripts` entries (`{"command": "bun run dev", "type": "service"}`) for
  long-running services Paseo should offer to start.
- **Root `package.json` scripts** — the `scripts` of `assets/package.json.tmpl`:
  - `tests`, not `test`: `bun test` is bun's built-in runner and shadows a script named `test`, so
    `bun test` would skip the script's flags and paths. `tests` runs `./packages` and `./scripts`
    (the Nx guard), in UTC, skipping `*.spec.ts` (browser specs) and `dist`.
  - `typecheck` builds, type-checks `scripts/`, then runs each package's `typecheck` except nzyme's
    (nzyme's CI checks nzyme).
  - `codegen`, `watch`, `dev` fan out through Nx to the targets in `project.json` and the packages.
  - `lint*`, `format*`, `lint:nzyme`: why each flag is there is in `references/lint-format.md`.
  - `clean`, `clean:npm`, `reinstall`: the way back from a broken install.
  - Elements add their own: `test:stories` (UI package), `e2e` (e2e), `storybook`.

Older alternatives found in product repos and not used: a monolithic `setup.sh` that CI cannot share,
`sh` scripts called from CI workflows directly, a Conductor config instead of `paseo.json`, and
symlinked `.env` files (fine for a rarely edited file, but a worktree's edit then leaks into all of
them).

## Placeholders

- `setup.build.sh.tmpl` has two conditional blocks. Keep the lines between `# {{if nuxt}}` and
  `# {{end}}` when a package has `nuxt.config.ts`; keep `# {{if browser-tests}}` … `# {{end}}` when
  the repo has a `playwright.config.ts` or a Vitest config with `browser.enabled`. Drop the marker
  lines either way. The Playwright install uses the repo's own `playwright` package (`bun x`), so the
  browser matches the version the tests run; CI adds `--with-deps` because a fresh runner lacks the
  browser's system libraries.
- `paseo.json.tmpl`: `{{branchNameInstructions}}`, `{{commitMessageInstructions}}`,
  `{{pullRequestInstructions}}` follow the repo's commit convention — its `git-workflow` skill or
  `CLAUDE.md` when it has one, else ask. With Conventional Commits, take the three strings from
  nzyme's own `paseo.json` (`../../../../paseo.json`), dropping its package-scope rule; otherwise
  write them in the same shape: branch `<type>/<short-kebab-slug>`, the commit subject's language and
  form, and "the PR title becomes the squash commit, so it follows the commit style; the body says
  what changed and why".
- A repo with a production line (`release`) besides `main` catches a hotfix worktree up with
  `release` instead: nzyme's own `setup.sh` (`../../../../setup.sh`) resolves the base among both and
  is the variant to adapt.

## Compare

- `setup.sh`, `setup.build.sh`: by `# --- section ---` and by step. A step the reference has and the
  repo lacks, or one in the wrong file (a submodule checkout or catch-up in `setup.build.sh`,
  anything needing credentials in it), is a difference. Repo-only steps (local infrastructure,
  secrets decryption, a database) stay in `setup.sh`, after the build.
- CI that runs `setup.sh`, or its own copy of the build commands, instead of `bash setup.build.sh`: a
  difference (`references/github.md`).
- `paseo.json`: key-wise; the repo's instruction texts, teardown and scripts stay. A missing
  `paseo.json`, or one whose setup is not `zsh setup.sh`, is a difference.
- `package.json` scripts: by name. A script the reference has and the repo lacks is added; one with
  the same name and a different command is shown, with the reason the reference's form exists. A
  `test` script is renamed `tests`. Repo-only scripts stay.
