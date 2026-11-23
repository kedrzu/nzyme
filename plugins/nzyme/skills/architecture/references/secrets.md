# Secrets

Every credential the repo needs — the app's, a script's, a token a tool uses — lives in a remote
store behind a login, under a prefix, and reaches the code (the env variable or config entry named by its key) through
`@nzyme/secrets`. No secrets file exists in the repo or beside it. Practice: `../../../../docs/practice/secrets.md`;
API: `nzyme/packages/secrets/README.md`; why: `nzyme/docs/decisions/secrets-declared-and-resolved-through-the-container.md`.

## Reference state

- **A store**, chosen once and recorded with its reason in `ARCHITECTURE.md`. The one implemented is
  Bitwarden Secrets Manager (`@nzyme/bitwarden`, setup in `nzyme/packages/bitwarden/README.md`:
  a dedicated organization, a project per repo or environment, a machine account per machine,
  read-only on a machine that only reads). Another store (AWS Secrets Manager, SSM Parameter Store, …) has no implementation yet:
  choosing it means writing it in nzyme first, as a `SecretStore`, before this element can
  be applied. Say so instead of wiring a store that does not exist.
- **A secrets package** `packages/secrets` (`@<product>/secrets`), the one home of the repo's secrets, imported
  by the CLI and by any app or script that reads them:
  - `secrets.ts` — every secret as a `defineSecret(name, { description, enabled?, meta? })` export;
    `getSecretDefinitions(secrets)` collects them. Nothing else lives in this module, so a runtime bundle
    that imports it (a Worker, a Nitro server) pulls no store code.
  - The stores — one or more `SecretStore`s in a service of their own, each wrapped in `cached(store, { ttl })`
    and scoped by a prefix (a path such as `/secrets/dev/`, a name prefix such as `DEV_`, or empty for the
    whole store). The key is the variable name; there is no mapping. Environments are the repo's: the
    prefix comes from an env variable in the service's `deps` (`GITHQ_ENV`, for example), declared in this
    package too.
  - No loader of its own: a process calls `loadSecretsConfig(container, stores)` from `@nzyme/secrets`, which
    installs the environment variables, then the stores (none when `CI` is set: a CI job gets the values as
    environment variables from GitHub Actions secrets), so a variable wins over the store. Code that runs
    without a secret on purpose reads it with `resolveOptionalSecret`.
- **Runtime reads go through the container.** Code the repo owns never reads a secret from `process.env`,
  `import.meta.env` or a raw binding: it resolves the `defineSecret` definition (`container.resolve(SECRET)`,
  or the service's `deps`).
  - A Bun script or CLI command calls the loader at startup, so it reads the store itself: no
    `bun secrets run` wrapper.
  - A runtime with no store access builds its container from what its platform hands it: a Cloudflare
    Worker from its bindings (`loadConfig(container, [envSource(env)])`), a Nitro server from its runtime
    config in a server plugin.
  - Only external tools (wrangler, Tauri, a Python script, a shell step) get secrets as environment
    variables, through `bun secrets run [KEY]... -- <tool>` locally and job `env` in CI.
- **Commands** — `defineSecretsCommands({ provider })` registered in the product CLI (`references/product-cli.md`),
  and the root `package.json` wrapper `"secrets": "<product> secrets"`, so they run as `bun secrets …`. The provider is a service built with
  `secretsProvider({ secrets: getSecretDefinitions(secrets), store })`. Several stores need a composite
  `SecretStore` of the repo's own. Every `@nzyme/*` package is one version installed in the repo.
- **CI** — a job that needs secrets gets `BWS_ACCESS_TOKEN` (a read-only machine account's token) from a GitHub
  Actions secret and runs through `bun secrets run <KEY>... --`, naming the keys it needs. The `Build` job needs none
  (`references/github.md`).
- **The repo's skill** `.claude/skills/secrets/SKILL.md` — required, not offered: without it an
  agent does not know how to invoke the commands here or which environment a name belongs to. What it
  holds: `references/repo-skills.md`.

## Placeholders

- The store and its project ids: from the user, once; ids go into the provider as code (a project id
  is not a secret).
- The prefix of each store: the repo's own convention for where a tier or environment's secrets live.
- The command prefix: the product CLI's binary name.

## Compare

- Credentials read through `defineEnvVariable` with no `@nzyme/secrets` store: a difference.
- Declarations or stores outside `packages/secrets` (in the CLI package, in an app): a difference. Move them.
- Code the repo owns reading a secret from `process.env`, `import.meta.env`, a raw binding or Nuxt's
  `useRuntimeConfig()` instead of resolving its `defineSecret` through the container: a difference.
- A Bun script wrapped in `bun secrets run` only to receive secrets it could load itself: a difference.
- A repo's own copy of `loadSecretsConfig` or `resolveOptionalSecret`: a difference; use `@nzyme/secrets`.
- No `defineSecret` declarations (a provider with only `stores` and `target`), or `bun nzyme secrets` or an
  `nzyme.plugins` entry in use: a difference.
- A dotenv file holding credentials (`.env`, `.env.*`, `.dev.vars`): a difference. Migrate it
  once, with no tool for it: pipe its value from the file into
  `bun secrets set <NAME>` (`sed -n 's/^NAME=//p' .env | bun secrets set NAME`, unquoting a quoted value in
  the pipe) so it never reaches the transcript. Move the file aside — Bun loads the cwd `.env` into
  every process, so `bun secrets list` would report its names `overridden by environment` — and delete it
  once `bun secrets list` shows every name resolving.
- `setup.sh` copying env files into worktrees: a difference; the keychain is shared by every
  worktree.
- No `.claude/skills/secrets/SKILL.md`, or one that disagrees with the provider: a difference.
