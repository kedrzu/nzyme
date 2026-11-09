# Repo skills

nzyme holds each practice as a document, `nzyme/docs/practice/<area>.md`; the repo owns the skill
that brings it to an agent. One model-invocable skill per area the repo has, holding what is true
only here and ending with a line that inlines the document, so an agent gets both in one load
without anyone invoking `architecture`. Why: `nzyme/docs/decisions/practice-docs-inlined-into-repo-skills.md`.

## Which areas

|Area|In play when the repo has|
|-|-|
|`code-conventions`, `ioc`, `logging`, `testing`|always|
|`ui`|the UI package or Nuxt app element|
|`composables`|`vue` in a package's `package.json`|
|`forms`|`@nzyme/vue-forms` in a package's `package.json`|
|`translations`|`*.loc.yaml` files or `@nzyme/i18n` in a package's `package.json`|
|`drizzle`|the SQL with Drizzle element|
|`api-clients`|the third-party APIs element|
|`secrets`|the secrets element|

Each area in play has exactly one repo skill, and no other repo skill covers it. Before writing one,
map the repo's existing skills to areas: a skill the repo already has for the area (`database` for
`drizzle`, `components` for `ui`) becomes that area's skill and gains the inline line; two skills on
one area merge into one. Two areas the repo treats as one (UI components and their stories) may share
one skill that inlines both documents. A repo skill outside every area (`app`, `deploy`) is the
repo's own and not compared.

## What a skill holds

`.claude/skills/<name>/SKILL.md`, from `assets/repo-skill.md.tmpl`:

- **Frontmatter** — `name` and `description` in the repo's vocabulary (`database`, not `drizzle`, if
  that is what the repo says). The description leads with the key use case and stays near 400
  characters: what the area is here, then when to use it. Model-invocable: no
  `disable-model-invocation`.
- **Repo facts** — only what holds here:
  - **Paths** — the package, its folders, where stories, tests, schema, migrations or generated files
    go.
  - **Decisions** — the repo's choices for the area, one line each, linking the section of
    `ARCHITECTURE.md` (or `docs/architecture/<area>.md`) that records the reason.
  - **Requirements the repo enforces**, with what enforces them (for UI: a story and a story-based
    test per component, WCAG 2.2 AA through axe in those tests).
  - **Commands** — how to run the area's checks, codegen or migrations.
- **The inline line, last** — `` !`cat nzyme/docs/practice/<area>.md` ``, one per document. Claude
  Code replaces it with the document when the skill loads; the path is relative to the repo root,
  where every session starts. The document's references (`nzyme/docs/practice/<area>/…`) and package
  READMEs (`nzyme/packages/<pkg>/README.md`) are linked by path, never inlined.

For `secrets` the facts are the whole point: the exact prefix (`bun nzyme secrets` or the product
CLI's), the provider file, each store and its environments, the variable that selects the environment
and how to run a command against another one, whose machines can write, and any secrets command the
repo adds.

It never restates the document. If a line would hold everywhere nzyme is used, it belongs in the
practice document, not here.

## Writing and updating

- Fill it from the repo, not from guesses: read the packages, existing components or queries, and
  `ARCHITECTURE.md` first. Ask only for what neither says.
- Keep the facts short — a screen at most. Growth means practice is leaking in; move it to the
  document or cut it.
- It goes through the apply protocol like any element: show the diff, write on approval, by heading
  section when the file exists, keeping sections the repo added.
- Never add it to `CLAUDE.md`: the skill loads on its own from its description
  (`references/claude-code.md`).
