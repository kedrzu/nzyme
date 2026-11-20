# Product CLIs over `nzyme` plugins

## Status

Accepted

## Context

`nzyme-cli-plugins.md` let a repo list modules under `nzyme.plugins`, and the `nzyme` binary imported
them on every run to add the repo's commands (`secrets`, `pen`).

- The loader imported product code in every `nzyme` invocation, including `nzyme submodule bump` in
  consumer checkouts, where the product's dependencies are not installed. Loading had to be made
  non-fatal, so a broken plugin showed up as an unknown command next to a warning.
- A plugin's commands must extend the `Command` of the one `@nzyme/cli-core` the binary runs, which
  forced every `@nzyme/*` package onto one version, `@nzyme/cli` included.
- Repos with a product CLI (healed) already register the same commands there.

> **Checked 2026-11-19 (Bun 1.4.4):** a workspace package with `"bin": { "<product>": "src/cli.ts" }`,
> whose file starts with `#!/usr/bin/env -S bun --conditions=source`, runs as `bun <product> …` with no
> build step: `node_modules/.bin/<product>` links to the `.ts`, `--` reaches the CLI intact and
> `--conditions=source` is applied.

## Options Considered

- **Keep plugins.** No new package in a repo, but every `nzyme` run loads product code and the version
  coupling stays.
- **A product CLI.** One small package per repo, no build, no loading by the binary.

## Decision

The user chose product CLIs, as healed has. The `nzyme` binary loads no project code: `nzyme.plugins`,
`NzymePlugin` and `@nzyme/pen/plugin.js` are removed. A repo defines `packages/cli` (`@<product>/cli`)
and registers `definePenCommands()` and `defineSecretsCommands({ provider })` in `execute({ ... })`.

## Consequences

- Breaking for repos using `nzyme.plugins`: they add `packages/cli` and change `nzyme secrets|pen …` to
  `bun secrets|pen …`, the pen merge driver and `pen check` in lint included.
- Each shared command group gets a wrapper script in the root `package.json` (`"secrets": "<product> secrets"`,
  `"pen": "<product> pen"`), so docs, skills and templates read the same in every repo and name no product.

> **Checked 2026-11-20 (Bun 1.4.4):** with `"pen": "prod pen"` in the root `package.json`,
> `bun pen merge base ours theirs 'p a t h'` handed the CLI `["pen","merge","base","ours","theirs","p a t h"]`,
> and `bun secrets run -- echo hi` handed it `["secrets","run","--","echo","hi"]`; Bun's `$ …` echo went to
> stderr. From a sub-package directory `bun secrets` failed with `Script not found "secrets"`.

- `nzyme submodule bump` and every other built-in run touch no product code.
- Commands are no longer available in a repo with no CLI of its own: it needs the small package above.
