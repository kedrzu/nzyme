# Secrets

Every credential the repo needs — the app's, a script's, a token a tool uses — lives in a remote
store behind a login, mapped to the env variable that reads it, and reaches the code through
`@nzyme/secrets`. No secrets file exists in the repo or beside it. Practice: `../secrets/SKILL.md`;
API: `nzyme/packages/secrets/README.md`; why: `nzyme/docs/decisions/secrets-as-code-through-env-variables.md`.

## Reference state

- **A store**, chosen once and recorded with its reason in `ARCHITECTURE.md`. The one implemented is
  Bitwarden Secrets Manager (`@nzyme/bitwarden`, setup in `nzyme/packages/bitwarden/README.md`:
  a dedicated organization, a project per repo or environment, a machine account per machine,
  read-only on a machine that only reads). Another store (AWS Secrets Manager, SSM Parameter Store, …) has no implementation yet:
  choosing it means writing it in nzyme first, as a `SecretStore`, before this element can
  be applied. Say so instead of wiring a store that does not exist.
- **A provider** — a `defineService<SecretsMapping>(…)` beside the code that reads
  the variables (the app package, or a shared package when several apps share secrets): one store,
  wrapped in `cached(store, { ttl })`, and each variable mapped to its key in it. Environments are the repo's: the provider picks the project or keys from
  an env variable in its `deps` (the app's `ENV`, for example).
- **Startup** — each process that reads secrets in development calls
  `await loadSecrets(container, AppSecrets)` with its provider before resolving anything that reads them. Production gets the variables
  from its platform and skips it.
- **Commands** — `defineSecretsCommands({ provider })` registered in the product's CLI, or, with no
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
- The secret names: from the `defineEnvVariable` declarations that hold credentials.
- The command prefix: the product CLI's binary name, or `bun nzyme`.

## Compare

- Credentials read through `defineEnvVariable` with no `@nzyme/secrets` mapping: a difference.
- A dotenv file holding credentials (`.env`, `.env.*`, `.dev.vars`): a difference. Migrate it
  once, with no tool for it: map each name, then pipe its value from the file into
  `secrets set <NAME>` (`sed -n 's/^NAME=//p' .env | secrets set NAME`, unquoting a quoted value in
  the pipe) so it never reaches the transcript. Move the file aside — Bun loads the cwd `.env` into
  every process, so `secrets list` would report its names `overridden by environment` — and delete it
  once `secrets list` shows every name resolving.
- `setup.sh` copying env files into worktrees: a difference; the keychain is shared by every
  worktree.
- No `.claude/skills/secrets/SKILL.md`, or one that disagrees with the provider: a difference.
