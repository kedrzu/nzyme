# Claude Code

Everything an agent needs is committed: the settings that install the plugins and keep the context
lean, the nzyme skills at the pinned commit, the repo's own skills and a thin `CLAUDE.md`. A fresh
clone or a new worktree behaves the same for every agent, with no per-machine setup beyond
`zsh setup.sh`.

## Reference state

- **`.claude/settings.json`** — `assets/claude-settings.json.tmpl`, nzyme's own committed settings
  (`../../../../.claude/settings.json`) adapted to the product's scripts. Each part:
  - `$schema` — completion and validation in the editor.
  - `permissions.allow` — the root scripts (`assets/package.json.tmpl`), bun tooling, the setup
    scripts, everyday git subcommands, `gh`, read-only shell utilities and the core tools.
    `Bash(bun nzyme:*)` matters most: the `verify` skill wraps every check in `bun nzyme quiet-run`,
    and without it each check prompts. `git push` is deliberately absent, so a push asks.
  - `permissions.deny` — tools that let an agent act outside the session or unattended (scheduled
    wake-ups, cron jobs, push notifications) and tools the workflow never uses. A denied tool also
    leaves the context.
  - `disableBundledSkills: true` — removes the skills and workflows bundled with Claude Code. They
    fill every session's skill list, and some compete with the repo's contracts (a bundled review
    against `/dev:review`). Plugin skills and `.claude/skills/` are unaffected.
  - `disableWorkflows: true` — removes dynamic workflows and the bundled workflow commands; the `dev`
    plugin is the pipeline.
  - `disableArtifact: true` — removes the Artifact tool, which publishes session output as a page on
    claude.ai. Unused here, it only costs context.
  - `autoMemoryEnabled: false` — no automatic memory notes in `~/.claude/projects/<project>/memory/`.
    They are shared across worktrees and loaded into later sessions, so behaviour would depend on
    unreviewed, uncommitted notes. What should persist goes to `CLAUDE.md`, a skill or
    `ARCHITECTURE.md`.
  - `agentPushNotifEnabled: false` — no proactive push notifications to a phone over Remote Control;
    with several agents in parallel worktrees they are noise.
  - `extraKnownMarketplaces.kedrzu-skills` (GitHub `kedrzu/skills`, auto-updated) and
    `enabledPlugins`: `dev` (the pipeline: `/dev:fix` … `/dev:deliver`, `/dev:setup`), `git`
    (conflicts, stash safety, `/git:setup`, the protected-branch hook), `web-search`, `playwright` (the browser MCP), `skill-improve`,
    `guardrails` (hooks refusing dangerous commands), and from `claude-plugins-official`
    `skill-creator` and `claude-md-management`.
- **`.claude/git.json`** — `assets/git.json.tmpl`: `protectedBranches` lists `main`. The `git`
  plugin's hook refuses an agent's push to a listed branch; with no file every branch is pushable.
  `/git:setup` writes the same file.
- **`.claude/skills/nzyme`** — a committed symlink to `../../nzyme/plugins/nzyme`:

  ```sh
  ln -s ../../nzyme/plugins/nzyme .claude/skills/nzyme
  ```

  The `nzyme:*` skills (and this one) then load from the submodule and match the nzyme commit the
  repo pins (`docs/submodule-setup.md#agents`); a marketplace copy would follow nzyme `main`, not the
  pin.
- **`.claude/skills/verify/`, `.claude/skills/git-workflow/`** — the `dev` plugin's contracts,
  written by `/dev:setup` and `/git:setup` (`SKILL.md`, Finish). Area skills:
  `references/repo-skills.md`.
- **`CLAUDE.md`** — `assets/CLAUDE.md.tmpl`. nzyme's own section skeleton, adapted to a product:

  - architecture in a paragraph pointing at `ARCHITECTURE.md`, `nzyme/CLAUDE.md` for work inside
    `nzyme/`, the code map and the generated files;
  - essential commands and quiet-run;
  - verification and the dev pipeline: pointers to `verify` and `git-workflow`, the `nzyme:*` skills
    every task reads, the repo's own skills, ADRs in `docs/decisions/<title-slug>.md`;
  - TypeScript rules, Git, Diagnosing failures, Writing style, Agent tool use.

  Those last five are shared with nzyme's `CLAUDE.md` (`../../../../CLAUDE.md`), word for word, except
  that Git leaves the commit style to `git-workflow`. The file stays a hub: detail lives in the skills
  and `ARCHITECTURE.md`.
- **Local files** — `CLAUDE.local.md` (personal instructions, e.g. a reply language) and
  `.claude/settings.local.json` (personal grants, MCP servers) are gitignored (`assets/gitignore.tmpl`)
  and copied into each new worktree by `setup.sh` (`references/setup-scripts.md`).
- **`.mcp.json`** — none by default; a product adds its own servers and enables them with
  `enabledMcpjsonServers`. The browser MCP comes from the `playwright` plugin.

## Placeholders

- `CLAUDE.md`: `{{summary — …}}` from `ARCHITECTURE.md`'s opening, or ask; `{{repo skills — …}}`
  from `.claude/skills/*/` other than `nzyme`, `verify` and `git-workflow` (drop the bullet when there
  are none).
- `git.json`: add the production branch (e.g. `release`) when the repo has one besides `main`.
- `settings.json`: the allow list follows the root `package.json`. An element that adds a script adds
  its allow (`Bash(bun run e2e:*)`, `Bash(bun run storybook:*)`, a database script).

## Compare

- `settings.json`: key-wise. Repo-only allows, plugins (`naming`, `secrets`, `figma`) and settings
  stay. Missing disable flags, deny entries, plugins from the set above or `Bash(bun nzyme:*)` are
  differences. `Bash(*)` in `allow` is a difference: it grants everything the deny list and the
  guardrails exist to stop.
- An `nzyme@nzyme` entry in `enabledPlugins`, or an `nzyme` marketplace in `extraKnownMarketplaces`:
  always a difference. Remove both and add the symlink: a marketplace install of the same plugin
  wins over the symlinked copy, so the skills would silently follow nzyme `main` instead of the pin.
  Plugins the repo loads through committed symlinks into another submodule stay as they are.
- No `.claude/git.json`: a difference.
- `CLAUDE.md`: by heading section. The repo's own sections (language rules, a standing authorization
  for commits and PRs in worktrees, gotchas) stay. A shared section that differs from nzyme's text at
  the pinned commit is shown with nzyme's version.
- `AGENTS.md` instead of `CLAUDE.md`: Claude Code does not read `AGENTS.md`, so the reference is
  `CLAUDE.md`. Propose `git mv AGENTS.md CLAUDE.md`; if other agents still need `AGENTS.md`, keep it as
  a one-line pointer to `CLAUDE.md`. Fix references to a `nzyme/AGENTS.md`, which does not exist.
- A tracked `.claude/settings.local.json` or `CLAUDE.local.md`: propose `git rm --cached` and the
  ignore entries.
