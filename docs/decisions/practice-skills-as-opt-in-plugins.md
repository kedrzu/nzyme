# Practice skills as opt-in plugins

## Status

Superseded by [practice-docs-inlined-into-repo-skills.md](practice-docs-inlined-into-repo-skills.md).

## Context

`ui`, `drizzle` and `api-clients` were user-invoked only
([reference-architecture-as-user-invoked-skills.md](reference-architecture-as-user-invoked-skills.md)):
every repo would otherwise pay for the description of every area, whether or not it has that area. The
agent reached them through a path in a repo-owned skill.

> **Checked 2026-11-06** on healed's agent transcripts since 2026-10-12: the text of `ui` reached 6 of
> 94 agents that edited a `.vue` file. A path in a skill does not get a body read.

> **Checked 2026-11-06 (Claude Code 2.1.318, plugin through `--plugin-dir`):**
>
> - `skillOverrides: "on"` does not list a skill with `disable-model-invocation: true`; `"off"` does hide one.
> - Plugin skills are not affected by `skillOverrides` at all (stated in the skills docs).
> - `paths` hides a standalone skill until a matching file is touched, but a plugin skill stays listed
>   from the start.

So one plugin cannot be model-invocable per repo; the plugin is the unit of enabling.

## Options Considered

- **Drop the flag in `nzyme`.** No new plugins, but a repo with no UI or SQL carries their descriptions.
- **Standalone skills with `paths`.** Hidden until relevant, but outside any plugin, colliding with
  repo skills of the same name, and unchecked in subagents.
- **One plugin per area, linked per repo.** `plugins/nzyme` stays as it is, and `/nzyme:architecture`
  still reads every practice skill by path, also from a user-level install in an empty directory.
  `plugins/nzyme-ui`, `nzyme-drizzle` and `nzyme-api-clients` hold the same skill without the flag.

## Decision

One plugin per area, linked per repo through a committed symlink, as `.claude/skills/nzyme` is.

The flag sits in `SKILL.md`, so that one file exists twice. `plugins/nzyme` holds the original, and
`scripts/practicePlugins.test.ts` fails when a copy differs by anything but the flag. `references/` is a
symlink into `plugins/nzyme`, which a marketplace install dereferences (documented for links within one
marketplace) and an in-place load follows.

## Consequences

- A repo that links a practice plugin has its description in every session, and pays up to 1,536
  characters of the skill listing's budget for it.
- The listing has a budget, 1% of the context window by default. In healed, with 62 skills, the three new
  plugins and `nzyme:forms` lost their descriptions until `skillListingBudgetFraction` went to `0.015`
  (checked 2026-11-06).
- A description alone does not get a body loaded: `nzyme:code-conventions`, model-invocable, reached 12%
  of the main agents that edited a `.ts` file. The product's `CLAUDE.md` therefore names the practice
  skill for its area.
- A reference in a shared `references/` cannot use a path relative to its own directory to leave the
  skill: it is read through both plugins.
