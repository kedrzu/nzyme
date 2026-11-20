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
- **Shared commands have a wrapper script** in the root `package.json`, one per command group the repo
  uses: `"secrets": "<product> secrets"`, `"pen": "<product> pen"`. Everything outside `package.json` — the
  repo skills, docs, error messages, the merge driver in `setup.sh`, root scripts such as `lint` — runs
  `bun secrets …` and `bun pen …`, the same in every repo, so nzyme's practice docs and templates name no product.
  Bun runs a script before a bin of the same name and appends the arguments, `--` and quoting intact; its
  `$ …` echo goes to stderr, so stdout stays the command's own. `bunx pen` is still the `@pen.dev/cli` binary.
- **Inside a sub-package's scripts** the wrapper is out of reach (Bun looks up scripts only in the nearest
  `package.json`), so they call the binary itself: `<product> secrets run -- wrangler dev`. The product name
  appears only in `package.json` files.
- **The repo's own commands** run as `bun <product> …` (`node_modules/.bin/<product>` links to the file).
  A group they use everywhere may get its own wrapper the same way.
- **Dependencies:** `@nzyme/cli-core` and the packages whose commands it registers, as `workspace:*`; every
  `@nzyme/*` package one version.

## Placeholders

- `<product>`: the repo's name, from the user.
- The commands to register: from the elements in play (secrets, design in Pen) and the repo's own.

## Compare

- An `nzyme.plugins` field in `package.json`, or `bun nzyme secrets` / `bun nzyme pen` in a script, a skill or
  the docs: a difference. Move the commands into the product CLI.
- No `secrets` / `pen` wrapper script in the root `package.json` while the group is registered, or
  `bun <product> secrets|pen` outside a `package.json`: a difference. Add the wrapper and use `bun secrets|pen`.
- No product CLI while `secrets` or `pen` commands are in use: a difference.
