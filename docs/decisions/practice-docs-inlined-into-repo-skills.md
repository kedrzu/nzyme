# Practice docs inlined into repo skills

## Status

Accepted. Supersedes [practice-skills-as-opt-in-plugins.md](practice-skills-as-opt-in-plugins.md) and
the practice-skill part of
[reference-architecture-as-user-invoked-skills.md](reference-architecture-as-user-invoked-skills.md).

## Context

The `nzyme` plugin shipped the practice skills (`code-conventions`, `ioc`, `logging`, `testing`,
`forms`, `composables`, `translations`, `secrets`, and the user-invoked `ui`, `drizzle`,
`api-clients`), and each product repo added its own skills on top. Measured in healed on 2026-11-06:

- Several descriptions per area sat in every session: UI alone had five (`frontend`, `components`,
  `stories`, the repo's `ui`, `nzyme-ui:ui`). With 62 skills the listing passed its budget (1% of the
  context window) and Claude Code silently dropped 16 descriptions.
- A description alone rarely gets a body loaded, and a path from a repo skill to an nzyme skill was
  followed less still: the text of `ui` reached 6 of 94 agents that edited a `.vue` file.
- The plugin had to be split per area to be enabled per repo, and its `SKILL.md` copied to drop
  `disable-model-invocation` (a frontmatter field no setting overrides).
- A disabled user-scope install of a plugin takes its name, so the in-repo copy stops loading without
  an error in the session.

> **Checked 2026-11-09 (Claude Code 2.1.318):** a line `` !`cat lib/docs/practice.md` `` in a project
> skill's `SKILL.md` is replaced by the file's content before the skill reaches the model, without an
> `allowed-tools` entry. The path is relative to the session's working directory: started in a
> subdirectory, the skill fails to load at all. A `${CLAUDE_SKILL_DIR}`-relative path is not run; it
> becomes an instruction for the agent to run the command itself.

## Options Considered

- **Practice skills in opt-in plugins** (the superseded decision). One description per area per
  plugin, but still a second skill beside the repo's own, a copied `SKILL.md`, and plugin loading as a
  dependency.
- **Generated repo skills** (`nzyme skills` assembling `SKILL.md` from a source plus nzyme docs). Robust
  to the working directory, but a generated file per skill to keep fresh. Rejected by the owner.
- **Practice as docs, inlined by repo skills.** nzyme holds plain documents; each repo owns the one
  skill per area and pulls the document into its body with `` !`cat …` ``.

## Decision

Practice as docs, inlined by repo skills.

- **nzyme owns the text.** Each practice is a document, `docs/practice/<area>.md`, with its references
  in `docs/practice/<area>/`. No frontmatter: a document says how to do the work, not when to load it.
  It never refers to a skill by name; it links other practice documents by path.
- **The repo owns the skills.** One model-invocable skill per area the repo has, named and described
  the way the repo calls the area. Its body holds the repo's own facts (paths, decisions, commands)
  and ends with `` !`cat nzyme/docs/practice/<area>.md` ``, so the agent gets both in one load.
  References are linked by path, never inlined. Two areas the repo treats as one (UI components and
  their stories) may share one skill that inlines both documents.
- **The `nzyme` plugin keeps only skills that act on the repo** (`architecture`). It is still linked
  through `.claude/skills/nzyme`, and still works from a user-level install in an empty directory.
- **nzyme itself is a consumer:** its own `.claude/skills/<area>/SKILL.md` inline
  `docs/practice/<area>.md` the same way.
- **Sessions start at the repo root,** which makes the relative path resolve; every launcher in use
  (Paseo, BMO, an editor) already does it. A rule in `CLAUDE.md` could not enforce it, because the
  agent reads it only after the session has started. The `nzyme` plugin carries a `SessionStart` hook
  instead: when the working directory is not the git top level, it tells the user that the repo's
  skills will not load and to restart from the root.
- **`/nzyme:architecture` creates and compares the repo skills.** Per area in play: a skill exists,
  inlines its document, carries only repo facts above it, and no second repo skill covers the same
  area.

## Plan

nzyme:

1. Move each practice skill to `docs/practice/<area>.md` (the `SKILL.md` body) and
   `docs/practice/<area>/` (its references); rewrite skill-name references between them as document
   links.
2. Remove the moved skills from `plugins/nzyme`, and the `nzyme-ui`, `nzyme-drizzle` and
   `nzyme-api-clients` plugins with `scripts/practicePlugins.test.ts` (`release.yml` keeps versioning
   whatever plugins remain).
3. Add nzyme's own repo skills for the areas it develops.
4. `/nzyme:architecture`: `references/repo-skills.md` becomes the procedure above with a skill
   template in `assets/`; `references/claude-code.md` drops the practice-plugin table and gains the
   compare rules; the element tables name practice documents instead of skills; the `CLAUDE.md`
   template names the repo's skills.
5. The `SessionStart` hook in `plugins/nzyme/hooks/`, with a test for a session at the root (silent)
   and in a subdirectory (warns).
6. `CLAUDE.md`, `docs/submodule-setup.md#agents` and the plugin and marketplace descriptions follow.

A product repo (healed first):

1. Map every area to one repo skill, merging what overlaps today (in healed: the thin `ui` into
   `components`, `app` into `frontend`, `database` inlining `drizzle`, `testing` inlining `testing`),
   and add skills for areas with none (`code-conventions`, `ioc`, `logging`, `forms`, `composables`,
   `translations`). `secrets` waits for the repo to use `@nzyme/secrets`.
2. Remove the practice-plugin symlinks, rewrite every `nzyme:<area>` and `nzyme-*:` reference to the
   repo skill, and lower `skillListingBudgetFraction` back to the default if the listing fits.
3. Prove it in a fresh `claude -p`: each skill lists with its description, and invoking one returns
   the repo facts followed by the document.

## Consequences

- One description per area in a repo's context, written by the repo for its own vocabulary.
- A practice change reaches a repo when it bumps nzyme, with no copy or generation step.
- Every repo writes its skills; `/nzyme:architecture` keeps them from drifting only when it runs.
- A session started outside the repo root loses every repo skill that inlines a document; the hook
  makes that visible at once rather than through an agent that silently lacks its rules.
