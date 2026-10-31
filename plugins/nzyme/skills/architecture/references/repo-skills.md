# Repo-owned skills

When work enters an area that has a practice skill (`ui`, `drizzle`, `api-clients`) or the Nuxt app,
offer to write — or bring up to date — a skill that lives in the repo. The nzyme skill holds the
practice; the repo skill holds what is true only here, and links the nzyme skill for the rest. Agents
in the repo then pick up the area's rules on their own, without anyone invoking `architecture`.

## Where and what

`.claude/skills/<area>/SKILL.md`, one per area, named after the area as the repo calls it (`ui`,
`database`, `integrations`, `app`). It holds only:

- **Paths** — where this area's code lives: the package, its folders, where stories, tests, schema,
  migrations or generated files go.
- **Decisions** — the repo's choices for the area, each in a line, linking the section of
  `ARCHITECTURE.md` (or `docs/architecture/<area>.md`) that records the reason.
- **Requirements the repo enforces** — stated with what enforces them (for UI: a story and a
  story-based test per component, WCAG 2.2 AA through axe in those tests).
- **Commands** — how to run this area's checks, codegen or migrations.
- **Links** — the nzyme practice skill and the package READMEs, with a line on when to read each.

It never restates a rule the linked skill or README owns. If a line would hold everywhere nzyme is
used, it belongs in the nzyme skill, not here.

## Links

Link through the submodule, so the text matches the nzyme commit the repo pins:

- skills: `nzyme/plugins/nzyme/skills/<name>/SKILL.md`;
- package READMEs: `nzyme/packages/<pkg>/README.md`.

The practice skills are user-invoked, so the repo skill tells the agent to **read** the file, not to
invoke it. The model-invocable `nzyme:*` skills (`forms`, `testing`, …) can also be named; they load
on their own.

## Frontmatter

Model-invocable: no `disable-model-invocation`. The description says what the area is in this repo
and when to use it, so it triggers on the area's work:

```md
---
name: ui
description: >-
    Building and changing components in this repo's UI package (packages/ui) and the app's screens —
    where components, stories and tests live, the story-and-test requirement, and the design tokens.
    Use when creating, changing or reviewing a Vue component or a screen.
---

# UI

Read `nzyme/plugins/nzyme/skills/ui/SKILL.md` before building a component; it holds the practice.
Primitives and components: `nzyme/packages/vue-forms/README.md`, `nzyme/packages/vue/README.md`.

## Paths

- Components: `packages/ui/src/` — flat, folders only for families (`forms/`, `layout/`).
- Screens: `packages/app/<feature>/`, routed in `packages/app/app/router.options.ts`, built only
  from `packages/ui` components.
- Design tokens: `packages/ui/src/styles/tokens.scss`.

## Requirements

- Every component has a `*.stories.tsx` story per state; each story runs as a test in
  `bun run test:stories`, with axe failing on any WCAG 2.2 AA violation.

## Decisions

- Dialogs are built on reka-ui — `ARCHITECTURE.md#app-and-ui`.
```

## Writing and updating

- Fill it from the repo, not from guesses: read the packages, existing components or queries, and
  `ARCHITECTURE.md` first. Ask only for what neither says.
- Keep it short — a screen or two. Growth means practice is leaking in; move it to the nzyme skill
  or cut it.
- It goes through the apply protocol like any element: show the diff, write on approval, by heading
  section when the file exists, keeping sections the repo added.
- Link it from `CLAUDE.md` only if the repo lists its skills there; the skill loads on its own.
