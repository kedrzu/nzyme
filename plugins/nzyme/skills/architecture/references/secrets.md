# Secrets

Every credential the repo needs — the app's, a script's, a token a tool uses — lives in a remote
store behind a login, under a prefix, and reaches the code (the env variable or config entry named by its key) through
`@nzyme/secrets`. No secrets file exists in the repo or beside it. Practice: `../../../../docs/practice/secrets.md`;
API: `nzyme/packages/secrets/README.md`; why: `nzyme/docs/decisions/secrets-as-code-through-env-variables.md`.

## Reference state

- **A store**, chosen once and recorded with its reason in `ARCHITECTURE.md`. The one implemented is
  Bitwarden Secrets Manager (`@nzyme/bitwarden`, setup in `nzyme/packages/bitwarden/README.md`:
  a dedicated organization, a project per repo or environment, a machine account per machine,
  read-only on a machine that only reads). Another store (AWS Secrets Manager, SSM Parameter Store, …) has no implementation yet:
  choosing it means writing it in nzyme first, as a `SecretStore`, before this element can
  be applied. Say so instead of wiring a store that does not exist.
- **Stores** — one or more `SecretStore`s beside the code that reads the variables (the app package,
  or a shared package when several apps share secrets), each wrapped in `cached(store, { ttl })` and
  scoped by a prefix (a path such as `/secrets/dev/`, a name prefix such as `DEV_`, or empty for the
  whole store). The key is the variable name; there is no mapping. Environments are the repo's: the
  prefix or project comes from an env variable in the service's `deps` (the app's `ENV`, for example).
- **Startup** — a repo with a config document (`@nzyme/config`) lists `secretsSource(store)` among the
  document's sources. A repo without one has each process that reads secrets in development call
  `await loadSecrets(container, stores)` before resolving anything that reads them. Production gets
  the variables from its platform and skips it.
- **Commands** — `defineSecretsCommands({ provider })` (a service resolving to `{ stores, target }`; `target(name)` returns the store a key is written to or throws to refuse it) registered in the product's CLI, or, with no
  product CLI, a plugin module (`tools/secrets.ts`) listed under `nzyme.plugins` in the root
  `package.json`, run as `bun nzyme secrets …`. Every `@nzyme/*` package, `@nzyme/cli` included, is
  one version installed in the repo.
- **CI** — a job that needs secrets gets `BWS_ACCESS_TOKEN` (a read-only machine account's token) from a GitHub
  Actions secret and runs through `secrets run --`. The `Build` job needs none
  (`references/github.md`).
- **The repo's skill** `.claude/skills/secrets/SKILL.md` — required, not offered: without it an
  agent does not know how to invoke the commands here or which environment a name belongs to. What it
  holds: `references/repo-skills.md`.

## Placeholders

- The store and its project ids: from the user, once; ids go into the provider as code (a project id
  is not a secret).
- The prefix of each store: the repo's own convention for where a tier or environment's secrets live.
- The command prefix: the product CLI's binary name, or `bun nzyme`.

## Compare

- Credentials read through `defineEnvVariable` with no `@nzyme/secrets` store: a difference.
- A dotenv file holding credentials (`.env`, `.env.*`, `.dev.vars`): a difference. Migrate it
  once, with no tool for it: pipe its value from the file into
  `secrets set <NAME>` (`sed -n 's/^NAME=//p' .env | secrets set NAME`, unquoting a quoted value in
  the pipe) so it never reaches the transcript. Move the file aside — Bun loads the cwd `.env` into
  every process, so `secrets list` would report its names `overridden by environment` — and delete it
  once `secrets list` shows every name resolving.
- `setup.sh` copying env files into worktrees: a difference; the keychain is shared by every
  worktree.
- No `.claude/skills/secrets/SKILL.md`, or one that disagrees with the provider: a difference.
