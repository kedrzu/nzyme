# Reference architecture as user-invoked skills

## Status

Accepted

## Context

Every product repo built on nzyme (sigma, cook-app, neolithic, 12-krokow, githq) was set up by hand,
and each drifted differently: no `.github` outside sigma, `branch =`/`update = merge` in 12-krokow's
`.gitmodules`, no `.gitignore` in githq, lint scripts without `--disable-nested-config` in neolithic,
an `AGENTS.md` Claude Code never reads. Fixes stayed in the repo that paid for them: only sigma knew
that an Nx daemon per worktree drains the machine. Nothing written said which version of each building
block is the reference, and no single place said how nzyme apps build UI, SQL or API clients.

> **Checked 2026-10-30** on the skills written for this decision:
>
> - The four skills (`architecture`, `ui`, `drizzle`, `api-clients`) hold about 5,800 words in their
>   `SKILL.md` files and about 28,700 with references and templates. A model-invocable skill keeps its
>   description in every session's context and loads its body whenever it matches.
> - The product repos already diverge on purpose, not only by drift: SPA or SSR Nuxt, with or without
>   a database, CI or none. A generic rule cannot tell an accepted deviation from a forgotten one.

## Options Considered

- **Option A — model-invoked generic skills per area.** Each area (repo setup, UI, SQL, API clients)
  is a skill the model picks up on its own in every product repo. Trade-off: no command to remember,
  but every repo pays the context cost of every area's description and bodies, the skills cannot know
  what a given repo chose differently, and their trigger descriptions need tuning.
- **Option B — one setup skill or a template repo.** A scaffold produces a new repo once. Trade-off:
  simple to start, but an existing repo never catches up, a template cannot keep a repo's own
  additions, and there is no place for day-to-day practice.
- **Option C — user-invoked skills plus repo-owned skills plus `ARCHITECTURE.md`.**

  - `/nzyme:architecture` is a user-invoked router. It takes a free-form request, works out from it
    and the repo's state what is in play, compares each element with its reference and applies the
    difference on approval, so a re-run on a repo that is up to date changes nothing.
  - `ui`, `drizzle` and `api-clients` are user-invoked practice skills it routes to when big work
    starts.
  - The repo owns thin, model-invocable skills (`.claude/skills/<area>/`) holding its own paths and
    decisions, linking the nzyme skill rather than copying it.
  - `ARCHITECTURE.md` at the repo root describes the application on its own terms, readable without
    knowing nzyme, and records each choice with its reason.

  Trade-off: the user has to invoke a command to start, and each repo carries a few files of its own.

## Decision

Option C.

- **Context cost:** nothing generic is model-invoked in a product repo. Only the repo's own thin
  skills are, and only for areas the repo actually has.
- **Repos diverge:** each repo owns its skills and its `ARCHITECTURE.md`. A choice stated there with a
  reason is the repo's, and the router does not propose changing it again.
- **No modes:** the router routes by the request and the repo's state, not by subcommands.
- **One home per fact:** package usage lives in the package's `README.md`, code-level practice in the
  `nzyme:*` skills, submodule wiring in [docs/submodule-setup.md](../submodule-setup.md). Skills link
  these homes instead of restating them.
- Inside a product, the skills load through the `.claude/skills/nzyme` symlink into the submodule, so
  they match the pinned nzyme commit. A user-level install of the plugin runs `/nzyme:architecture` in
  an empty directory, before the submodule exists.

## Consequences

- **Gained:** one written reference for every repo element; repos catch up by re-running the router
  rather than copying a neighbour; a product's context holds only what that repo uses;
  `ARCHITECTURE.md` explains the repo to people and agents who do not know nzyme.
- **Accepted:**
  - Nothing happens until someone runs `/nzyme:architecture`. Drift between runs is not caught.
  - Repo-owned skills can go stale against the nzyme skills they link; the router refreshes them only
    when it runs.
  - The reference lives in skill text and templates, and is checked by evals rather than tests.
