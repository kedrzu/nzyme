# `ARCHITECTURE.md`

The repo's own description of its whole architecture, at the repo root. Two readers depend on it:

- **Anyone opening the repo** — a developer or an agent, today or in two years — learns what the
  system is, where each part lives and why it is built that way. They must not need to know that
  nzyme has guidelines, or that a reference architecture exists.
- **This skill, between runs**, reads it as the record of what the repo chose. A choice stated there
  with a reason is settled: it is not proposed for change again unless the user reopens it.

## Writing it

- **Describe the repo on its own terms.** "The app is a Nuxt SPA; there is no server rendering
  because every page is behind a login." Never "unlike the nzyme default", "we deviate from", "instead
  of the reference", "nzyme recommends". nzyme appears only where it is part of the system: the
  `@nzyme/*` packages in the stack, built from the `nzyme/` submodule.
- **The whole architecture, not the diff.** An element taken as the reference is described just like
  one the repo chose differently: what it is and, where it is not obvious, why.
- **Facts a reader cannot get from one file.** Which package owns what, how the app reaches its data,
  how builds stay isolated between worktrees. Not versions (they live in `package.json`), not file
  listings the code index already gives, not code-level practice (that is in the skills).
- **Omit a section with nothing in it** — no "N/A", no empty headings.

Start from `assets/ARCHITECTURE.md.tmpl`. Its sections: summary, stack, packages and what each owns,
app and UI structure, integrations, tooling and workflow, decisions.

## Recording choices

Every notable choice goes under **Decisions** as one bullet: the choice in bold, then the reason.

```md
- **Lint runs oxlint only, no ESLint.** The repo has no Vue files for ESLint to check.
- **CI runs on pull requests only, not on pushes to main.** main is protected and only receives merged
  pull requests that already passed.
```

- **An accepted element** is recorded as the repo's state in the section it belongs to (stack,
  tooling, …). It goes under Decisions only when a reader would ask why.
- **A declined difference** always goes under Decisions, written as what the repo does and why. Its
  reason is the user's, in their substance; ask for one rather than inventing it.
- **Match on the next run** by meaning, not wording: before proposing a difference, check whether a
  decision already covers that element and that choice. If it does, skip it and list it in the report
  as settled.
- **A long deliberation** (options weighed, trade-offs) goes into an ADR in `docs/decisions/<slug>.md`;
  the bullet keeps the one-line choice and reason and links the ADR.
- **A choice that changes** is rewritten in place. The document describes the present; history is in
  git and the ADRs.

## Splitting

`ARCHITECTURE.md` starts as one file and stays one file while it reads in a few minutes. Split it only
once it has grown: past about 300 lines, or when one area takes more than half of it.

- Move each large area into `docs/architecture/<area>.md` (`app.md`, `data.md`, `tooling.md`, …),
  each written by the same rules.
- `ARCHITECTURE.md` stays at the root as a short router: the summary, the stack in a few lines, one
  link per area with a line on what it covers, and Decisions (or a link to them when they moved with
  their area).
- Never create `docs/architecture/` for a new or small repo, and never pre-split for growth that has
  not happened.

After a split, the apply protocol reads and writes the area files; an element's choices are recorded
in the area file it belongs to.

## Linking

The repo's `CLAUDE.md` links `ARCHITECTURE.md` (the Claude Code element's `CLAUDE.md` skeleton has
the line). Repo-owned skills link the section or area file that holds their area's decisions
(`references/repo-skills.md`).
