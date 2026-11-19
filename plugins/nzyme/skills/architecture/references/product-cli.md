# Product CLI

The repo's own commands, including nzyme's `secrets` and `pen` commands, live in a CLI the repo defines. The
`nzyme` binary loads no project code. Why: `nzyme/docs/decisions/product-clis-over-nzyme-plugins.md`; the
framework: `nzyme/packages/cli-core`.

## Reference state

- **A private workspace package** `packages/cli` named `@<product>/cli`, with `"bin": { "<product>": "src/cli.ts" }`
  and no build step: Bun runs the TypeScript. A CLI that builds `dist` first (healed's) works too.
- **`src/cli.ts`** starts with `#!/usr/bin/env -S bun --conditions=source` and calls
  `execute({ name: '<product>', container, commands: [...] })` from `@nzyme/cli-core/execute.js`.
- **Commands** the repo uses are registered there: `...definePenCommands()` (`references/design-in-pen.md`),
  `...defineSecretsCommands({ provider })` (`references/secrets.md`), and the repo's own.
- **Invocation** is `bun <product> …` from the root (`node_modules/.bin/<product>` links to the file; arguments
  after `--` reach the CLI intact). The `<product>` name appears in scripts, the merge driver and the repo skills.
- **Dependencies:** `@nzyme/cli-core` and the packages whose commands it registers, as `workspace:*`; every
  `@nzyme/*` package one version.

## Placeholders

- `<product>`: the repo's name, from the user.
- The commands to register: from the elements in play (secrets, design in Pen) and the repo's own.

## Compare

- An `nzyme.plugins` field in `package.json`, or `bun nzyme secrets` / `bun nzyme pen` in a script, a skill or
  the docs: a difference. Move the commands into the product CLI.
- No product CLI while `secrets` or `pen` commands are in use: a difference.
