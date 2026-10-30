# Markdown formatting in ESLint

## Status

Accepted

## Context

Markdown in nzyme and its consumers is kept in a token-minimising format (compact GFM tables, `-`
bullets, no inert escapes, bare autolinks). The `nzyme format-markdown` CLI command applied it as part
of `format`, with its own file walk, excludes and output. Checks of other non-code files, such as
`package.json`, already live in ESLint. The owner wants every check of a non-code file in one tool,
ESLint, with one style of feedback.

> **Checked 2026-10-30** with ESLint 10.13 and `@eslint/markdown` 8.0.3: a rule running remark
> `processSync` over the source text reports an unformatted file, `--fix` rewrites it, and the re-lint
> passes. ESLint 10 does not read `.gitignore`, and it does not enter symlinked directories.

## Options Considered

- **Option A — keep the CLI formatter in `format`.** Trade-off: no migration, but Markdown keeps its own
  tool, file walk and output next to ESLint.
- **Option B — an `@eslint/markdown` rule with a whole-file autofix.** The `markdown()` preset in
  `@nzyme/eslint` parses `.md`/`.mdx` as GFM with YAML frontmatter, and `nzyme/markdown-format` runs
  the same remark pipeline, reporting once per unformatted file. Trade-off: the fix replaces the whole
  file rather than pointing at a line, and the rule must skip gitignored files itself.

## Decision

Option B.

## Consequences

- Markdown is formatted by `lint --fix` (`bun run lint`) and checked by `lint:check`, not by `format`.
- `nzyme format-markdown` is removed — a breaking change for `@nzyme/cli` consumers, who add
  `...markdown()` to their ESLint config and drop the command from their scripts.
- Gitignored files are skipped, as before: the rule checks `isFileIgnored` from
  `@nzyme/project-utils`. Directories that should not be formatted (agent scratch space, a submodule)
  go in the config's ignores instead of `--exclude`.
- ESLint does not enter symlinked directories, so a symlinked skill directory is formatted where it
  lives, as before. A symlinked Markdown file, unlike before, is linted where it is linked.
