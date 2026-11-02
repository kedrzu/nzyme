---
name: architecture
description: >-
    The reference architecture of a product repo built on @nzyme — sets up a new repo, brings an
    existing one up to date element by element (monorepo layout, Nx and parallel worktrees, the nzyme
    submodule, setup scripts, lint and format, VS Code, Claude Code, GitHub, Nuxt app, UI package, e2e,
    and technologies such as Drizzle), keeps the repo's `ARCHITECTURE.md`, and when big work starts
    routes to the practice skill for that area (ui, drizzle, api-clients) and offers a repo-owned skill.
    Takes a free-form request; there are no modes or subcommands to remember.
disable-model-invocation: true
---

# Architecture

One entry point for "build it the way nzyme apps are built". The user says what they want in their
own words — "set up a new repo for a Nuxt app", "bring this repo up to date", "we're starting the UI
for the booking flow", "we're adding a Postgres database" — and the request plus the state of the
repo decide what is in play. There is nothing to choose up front.

Every path below is relative to this skill's directory (the base directory Claude Code announces when
the skill loads): `references/nx.md`, `assets/ARCHITECTURE.md.tmpl`, `../ui/SKILL.md`. The practice
skills are user-invoked, so read their `SKILL.md` by path; the Skill tool cannot load them.

When this skill runs inside a repo whose `nzyme/plugins/nzyme/skills/architecture/` exists, that copy
is the reference: it matches the nzyme commit the repo pins. Read references and assets from there.

## Read the request and the repo

Look before asking: is this a git repo, is it empty, is there an `nzyme/` submodule, a root
`package.json`, an `ARCHITECTURE.md`, `.claude/skills/`? Then match the request against the element
table below. The result is one of these situations, or a combination of them:

- **Nothing here yet** (an empty directory, or a repo with no product code) → a new repo. Do step 0,
  then every repo element, plus the app and technology elements the request names. Ask only what the
  request leaves open and the reference does not decide — the product name and npm scope, Nuxt SPA or
  SSR, whether there is a UI package, e2e, CI, a database. Where the reference has one answer, take it
  without asking.
- **An existing repo, a request about its setup** ("bring up to date", "check our Nx config", "fix
  lint setup") → compare the elements the request names; a general request means every repo element
  plus each app and technology element whose repo signals are present. A repo already at the
  reference gets "no differences" and no writes.
- **A request about a piece of work** ("starting the settings screen", "adding Stripe", "we need a
  database") → the element whose signals match. Check that its setup is in place (UI work with no UI
  package → propose the UI package element), read its practice skill, offer a repo-owned skill
  (`references/repo-skills.md`), then hand over. This skill does not build the feature; code-level
  work follows the practice skill and the `nzyme:*` skills (`ioc`, `forms`, `composables`,
  `translations`, `logging`, `testing`, `code-conventions`), which load on their own.

**Ask when it is unsettled:** no row matches, or two readings of the request would write different
files. Ask one question that names the readings. A choice `ARCHITECTURE.md` records with a reason is
settled — never ask it again or propose changing it unless the request reopens it.

### Step 0: a new repo

```sh
git init                                                     # if not a repo yet
git submodule add https://github.com/kedrzu/nzyme.git nzyme
```

Versions (Bun, `@types/bun`, tsgo, oxlint, oxfmt, eslint, nx) always come from `nzyme/package.json`,
never from this skill's text. Submodule wiring: `references/submodule.md`.

## Elements

The single routing source. Each element appears once; its reference says what the reference state is
and where each placeholder value comes from.

**Repo elements** — the default architecture; all in play for a new repo and a general update.

|Element|Request signals|Repo signals|Reference|
|-|-|-|-|
|Monorepo layout|workspace, tsconfig, Bun, ignores|root `package.json` workspaces, `tsconfig*.json`, `bunfig.toml`, `.gitignore`, `.gitattributes`, `.editorconfig`|`references/monorepo.md`|
|Nx and parallel worktrees|build, cache, Nx, worktrees, slow machine|`nx.json`, `project.json`, Nx inputs guard test|`references/nx.md`|
|nzyme submodule|submodule, nzyme version, bump nzyme|`.gitmodules`, `nzyme/`|`references/submodule.md`|
|Setup scripts|setup, onboarding, Paseo, scripts|`setup.sh`, `setup.build.sh`, `package.json` scripts, `paseo.json`|`references/setup-scripts.md`|
|Lint and format|lint, format, oxlint, oxfmt, ESLint|`.oxlintrc.json`, `.oxfmtrc.json`, `eslint.config.mjs`|`references/lint-format.md`|
|VS Code|editor, VS Code, format on save|`.vscode/`|`references/vscode.md`|
|Claude Code|Claude, agents, skills, permissions, `CLAUDE.md`|`.claude/settings.json`, `.claude/git.json`, `.claude/skills/nzyme`, `CLAUDE.md`, `docs/decisions/`|`references/claude-code.md`|
|GitHub|PR, CI, GitHub Actions, submodule bump|`.github/`|`references/github.md`|
|Architecture document|architecture, document the repo|`ARCHITECTURE.md`, `docs/architecture/`|`references/architecture-doc.md`|

**App elements** — in play when the request asks for them or the repo has them.

|Element|Request signals|Repo signals|Reference|Practice skill|
|-|-|-|-|-|
|Nuxt app|Nuxt, app, SPA, SSR, pages, routing|`nuxt.config.ts` in a package|`references/nuxt-app.md`|— (repo skill `app`)|
|UI package|UI, components, screen, design system, Storybook|a package with `.storybook/` or `*.stories.tsx`|`references/ui-package.md`|`../ui/SKILL.md`|
|e2e|e2e, end-to-end, Playwright|`playwright.config.ts`|`references/e2e.md`|`nzyme:testing`|

**Technology elements** — applied only when the repo uses that technology, never by default. A new
platform or technology (Cloudflare, Supabase, …) is added here as one more row.

|Element|Request signals|Repo signals|Reference|Practice skill|
|-|-|-|-|-|
|SQL with Drizzle|database, Postgres, SQL, Drizzle, migrations|`drizzle-orm` or `drizzle-kit` in a `package.json`|`../drizzle/SKILL.md`|`../drizzle/SKILL.md`|
|Third-party APIs|integration, vendor API, OpenAPI, GraphQL, webhook client|an OpenAPI spec or `.graphql` SDL in a package, `@nzyme/openapi`|`../api-clients/SKILL.md`|`../api-clients/SKILL.md`|

A backend (server package, hosting, deployment) is not part of the default architecture and has no
element; build it when the repo needs it, and record its shape in `ARCHITECTURE.md`.

## Apply protocol

The same steps for every element, in a new repo and an old one:

1. **Read `ARCHITECTURE.md`** (or its `docs/architecture/` split). A choice recorded there with a
   reason is the repo's; skip that difference.
2. **Read the element's reference** and its assets. Fill placeholders: `{{name}}` and the npm scope
   from the root `package.json` (asked once in a new repo), versions from `nzyme/package.json`, the
   rest as the reference says.
3. **Compare the repo with the reference**, keeping everything the repo added:
   - JSON (`package.json`, `nx.json`, settings): key-wise merge. Add or correct the keys the reference
     owns; keep repo-only keys, array entries, scripts, permissions, inputs and targets.
   - Scripts and markdown: by named script or heading section. Replace a section the reference owns
     only where it differs; leave the repo's own sections alone.
   - A file the repo lacks: the whole asset, filled.
4. **Show the diff** for each file before writing it — a unified diff, or the full content of a new
   file — with one line on why the reference wants it. Nothing is written unseen.
5. **Get the decision.** Interactively, ask per element ("apply all" is fine). When the prompt already
   carries approvals and declines (a headless run), follow them; a difference the prompt does not
   cover is reported, not written.
6. **Apply what was approved.** For a declined difference, get the reason (ask, or take it from the
   prompt).
7. **Record it in `ARCHITECTURE.md`** (`references/architecture-doc.md`): an accepted element as the
   repo's state, a declined one as the repo's choice with its reason. Both are written as what the repo
   does and why — never as a deviation from nzyme or a default.

Idempotence is the test of the protocol: re-running it on a repo it just brought up to date shows no
diff and writes nothing.

## Finish

1. Run `zsh setup.sh`, then the repo's lint check, format check and typecheck. Fix what the applied
   changes broke; report anything else.
2. `CLAUDE.md` links `ARCHITECTURE.md`.
3. If `.claude/skills/git-workflow/SKILL.md` or `.claude/skills/verify/SKILL.md` is missing, tell the
   user to run `/git:setup` and then `/dev:setup`. Those commands write them; this skill cannot run
   them.
4. Report: elements applied, differences declined (and where they are recorded), differences left
   open, check results. Commit only when the user asks; once `git-workflow` exists, it owns commits.

## References

- `references/architecture-doc.md` — `ARCHITECTURE.md`: structure, recording choices, when to split.
- `references/repo-skills.md` — the thin repo-owned skill: what it holds, its frontmatter.
- One reference per element, named in the tables above.
- `assets/*.tmpl` — file templates with `{{…}}` placeholders; a dotfile's asset drops the dot
  (`gitignore.tmpl`).
