# Claude Code

Everything an agent needs is committed: the settings that install the plugins and keep the context
lean, the nzyme skills at the pinned commit, the repo's own skills and a thin `CLAUDE.md`. A fresh
clone or a new worktree behaves the same for every agent, with no per-machine setup beyond
`zsh setup.sh`.

## Reference state

- **`.claude/.gitignore`** — `assets/claude-gitignore.tmpl`: personal settings and agent worktrees.
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
    `enabledPlugins` — the plugin set in "Plugins" below.
- **`.claude/git.json`** — written by `git:setup` (`SKILL.md`, Finish), because it follows from whether
  the main line takes direct pushes: `protectedBranches` lists it when it takes only PRs, plus a
  production branch (e.g. `release`) if the repo has one. The `git` plugin's hook refuses an agent's
  push to a listed branch; with no file every branch is pushable.
- **`.claude/skills/nzyme`** — a committed symlink to `../../nzyme/plugins/nzyme`:

  ```sh
  ln -s ../../nzyme/plugins/nzyme .claude/skills/nzyme
  ```

  The `nzyme:*` skills (and this one) then load from the submodule and match the nzyme commit the
  repo pins (`docs/submodule-setup.md#agents`); a marketplace copy would follow nzyme `main`, not the
  pin.
- **`.claude/skills/verify/`, `.claude/skills/git-workflow/`** — the `dev` plugin's contracts,
  written by following `dev:setup` and `git:setup` (`SKILL.md`, Finish). Area skills:
  `references/repo-skills.md`.
- **`CLAUDE.md`** — `assets/CLAUDE.md.tmpl`. nzyme's own section skeleton, adapted to a product:

  - architecture in a paragraph pointing at `ARCHITECTURE.md`, `nzyme/CLAUDE.md` for work inside
    `nzyme/`, the code map and the generated files;
  - essential commands and quiet-run;
  - verification and the dev pipeline: pointers to `verify` and `git-workflow`, the `nzyme:*` skills
    every task reads, ADRs in `docs/decisions/<title-slug>.md`;
  - TypeScript rules, Git, Diagnosing failures, Writing style, Agent tool use.

  Those last five are shared with nzyme's `CLAUDE.md` (`../../../../CLAUDE.md`), word for word, except
  that Git leaves the commit style to `git-workflow`. The file stays a hub: detail lives in the skills
  and `ARCHITECTURE.md`. It never lists the skills: the agent already sees every model-invocable
  skill's name and description from its frontmatter, so a list duplicates that and drifts. A
  skill is named in `CLAUDE.md` only where a rule routes to it ("every task reads
  `nzyme:code-conventions`").
- **Local files** — `CLAUDE.local.md` (personal instructions, e.g. a reply language) and
  `.claude/settings.local.json` (personal grants, MCP servers) are gitignored, the first in the root
  `.gitignore`, the second with `worktrees/` in `.claude/.gitignore` (`assets/claude-gitignore.tmpl`),
  and copied into each new worktree by `setup.sh` (`references/setup-scripts.md`).
- **`.mcp.json`** — none by default; a product adds its own servers and enables them with
  `enabledMcpjsonServers`. The browser MCP comes from the `playwright` plugin.

## Plugins

Plugins are committed in `enabledPlugins`, so every clone and worktree gets the same set. Each one
adds skills, commands or hooks to every session, so a project enables what it uses and nothing more.

**Always** — `assets/claude-settings.json.tmpl`:

|Plugin|Marketplace|What the repo gets|
|-|-|-|
|`dev`|`kedrzu-skills`|the pipeline (`/dev:fix` … `/dev:deliver`, `/dev:design`, `/dev:review`), `/dev:setup`|
|`git`|`kedrzu-skills`|conflict resolution, stash safety, `/git:setup`, the protected-branch hook|
|`guardrails`|`kedrzu-skills`|hooks that refuse dangerous commands and say what to do instead|
|`skill-improve`|`kedrzu-skills`|revising the repo's own skills from transcript evidence|
|`web-search`|`kedrzu-skills`|the research protocol every skill that searches relies on|
|`playwright`|`kedrzu-skills`|the browser MCP: e2e, story debugging, checking a page|
|`handoff`|`kedrzu-skills`|handing work to a fresh Paseo agent with a pointer summary|
|`retro`|`kedrzu-skills`|retrospectives on how agents worked in this repo|
|`claude-md-management`|`claude-plugins-official`|auditing and updating `CLAUDE.md`|
|`skill-creator`|`claude-plugins-official`|writing and evaluating the repo's own skills|

**Practice plugins** — one per area, because a plugin is the unit a repo can enable. Each holds the
same skill as the user-invoked one in `nzyme`, without `disable-model-invocation`, so its description
is in every session's context and the agent loads it on its own. A repo links only those it has the
element for, next to `.claude/skills/nzyme`, and a repo without UI or SQL pays nothing for them:

|Plugin|Skill|Linked when the repo has|
|-|-|-|
|`nzyme-ui`|`nzyme-ui:ui`|the UI package element|
|`nzyme-drizzle`|`nzyme-drizzle:drizzle`|the SQL with Drizzle element|
|`nzyme-api-clients`|`nzyme-api-clients:api-clients`|the third-party APIs element|

```sh
ln -s ../../nzyme/plugins/nzyme-ui .claude/skills/nzyme-ui
```

**When the repo uses it** — added with the element or integration that needs it, and recorded in
`ARCHITECTURE.md`:

|Plugin|Marketplace|When|
|-|-|-|
|`naming`|`kedrzu-skills`|the product or app has no name yet|
|`supabase`, `cloudflare`, `stripe`, `sentry`, `figma`, `linear`|`claude-plugins-official`|the repo uses that service; its MCP or skills replace guessing at the API|

**Never in a project** — personal tools belong in the user's own `~/.claude/settings.json`: `gmail-mcp`,
`gdrive-mcp`, `whatsapp`, `telegram`, `shopping-research`, `wait-what` (`kedrzu-skills`).

**New plugins.** The marketplaces grow. On every run, list `kedrzu-skills` — the local copy at
`~/.claude/plugins/marketplaces/kedrzu-skills/.claude-plugin/marketplace.json`, or
`gh api repos/kedrzu/skills/contents/.claude-plugin/marketplace.json --jq .content | base64 -d` —
and show the user every plugin none of the lists above classifies, with its description and a
recommendation. What they decide is recorded in `ARCHITECTURE.md`; a plugin no longer in the
marketplace is a difference (remove it from `enabledPlugins`).

## Placeholders

- `CLAUDE.md`: `{{summary — …}}` from `ARCHITECTURE.md`'s opening, or ask; `{{practice skills — …}}`
  from the practice plugins the repo links (drop the sentence when there are none).
- `settings.json`: the allow list follows the root `package.json`. An element that adds a script adds
  its allow (`Bash(bun run e2e:*)`, `Bash(bun run storybook:*)`, a database script).

## Compare

- `settings.json`: key-wise. Repo-only allows and settings stay, and so do plugins the repo chose
  (recorded in `ARCHITECTURE.md`, or from the "when the repo uses it" list). Missing disable flags,
  deny entries, an "always" plugin or `Bash(bun nzyme:*)` are differences; so is a personal plugin
  ("never in a project"). `Bash(*)` in `allow` is a difference: it grants everything the deny list and the
  guardrails exist to stop.
- An `nzyme@nzyme` entry in `enabledPlugins`, or an `nzyme` marketplace in `extraKnownMarketplaces`:
  always a difference. Remove both and add the symlink: a marketplace install of the same plugin
  wins over the symlinked copy, so the skills would silently follow nzyme `main` instead of the pin.
  Plugins the repo loads through committed symlinks into another submodule stay as they are.
- `secrets@kedrzu-skills` in `enabledPlugins`: a difference. Remove it; the `nzyme:secrets` skill and
  `secrets set --prompt` replace it, so every credential goes to the repo's store.
- Practice plugins: an element in play without its symlink is a difference, and so is a symlink
  without the element. A marketplace entry for one would follow nzyme `main` instead of the pin, like
  `nzyme@nzyme`: replace it with the symlink.
- `.claude/git.json`: not compared here. A repo without it may simply push to `main`; `git:setup`
  decides.
- `CLAUDE.md`: by heading section. The repo's own sections (language rules, a standing authorization
  for commits and PRs in worktrees, gotchas) stay. A shared section that differs from nzyme's text at
  the pinned commit is shown with nzyme's version. A list of the repo's skills is a difference:
  propose removing it.
- `AGENTS.md` instead of `CLAUDE.md`: Claude Code does not read `AGENTS.md`, so the reference is
  `CLAUDE.md`. Propose `git mv AGENTS.md CLAUDE.md`; if other agents still need `AGENTS.md`, keep it as
  a one-line pointer to `CLAUDE.md`. Fix references to a `nzyme/AGENTS.md`, which does not exist.
- A tracked `.claude/settings.local.json` or `CLAUDE.local.md`: propose `git rm --cached` and the
  ignore entries.

## Proposing a `CLAUDE.md` change

From any element, check the change first against the "Update Guidelines" in `SKILL.md` and against
`references/update-guidelines.md`, both in
`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/claude-md-management/skills/claude-md-improver/`.
Read only those: that skill's full workflow also audits `nzyme/CLAUDE.md` and scores every file, and
step 4 of the apply protocol already shows the diff with its reason.

They judge the repo's own sections and the filled placeholders. The sections shared with nzyme stay
word for word, so a problem found in one is fixed in nzyme's `CLAUDE.md`, not in the product's. The
local file here is `CLAUDE.local.md`, whatever name that skill uses. If the files are not there, say
so in the report and carry on.
