# Secrets as code, loaded into `EnvVariables`

## Status

Accepted

## Context

About fifteen private repos and the Healed monorepo each keep their development secrets in a
plaintext `.env`, copied between machines and worktrees by hand. They need one mechanism that:

- keeps secrets in a cloud store behind a login, not in a plaintext file and not encrypted in the
  repo (SOPS, age and dotenvx were rejected for that reason: a leaked repo or key leaks every secret
  ever committed, and rotation means a commit);
- reaches code through the existing `defineEnvVariable` injectables, so no consumer of a variable
  changes;
- works for a repo with its own product CLI and for one that has only the `nzyme` binary
  (`nzyme-cli-plugins.md`).

Healed has its own environments and AWS-account conventions, which other repos do not share.

> **Checked 2026-11-02:** a scopeless `defineCommand` resolves its dependencies on the root
> container, not on the container it is called with. A startup step built as a command would read the
> mapping and write `EnvVariables` of the wrong container in any app that uses child containers.

> **Checked 2026-11-02:** Bun 1.4.4 loads `.env` into `process.env` before any code runs. No loader
> can tell a variable set by the shell from one set by a leftover `.env`.

`defineEnvVariable` resolves through the container's `EnvVariables` interface
(`packages/ioc/src/defineEnvVariable.ts:154`), which defaults to `process.env`.

## Options Considered

- **A static declaration file** (`secrets.yaml` with `providers`, `secrets` and `environments`,
  proposed by a Design-It-Twice panel), with environments in the core. Language-neutral and readable
  without running code. Rejected by the user: the core would have to model environments, and Healed's
  environment and AWS-account conventions do not fit a generic model. Config as code lets each repo
  express its own conventions in TypeScript.
- **A `defineSecretsProvider` helper.** Rejected in favour of a plain ioc interface
  (`SecretsProvider`) that a project implements with `defineService({ implements })`: no new
  concept, and the mapping can depend on other services and env variables.
- **A startup step as a command.** Rejected: see the root-container check above.
- **A new source inside `defineEnvVariable`.** Rejected: writing into `EnvVariables` before anything
  resolves keeps `defineEnvVariable` unchanged.

## Decision

`@nzyme/secrets` defines the `SecretStore` contract, the `SecretsProvider` interface (stores by alias,
env-variable name to secret reference) and `loadSecrets(container)`, a plain function an app calls at
startup. It reads every mapped secret, one batch per store, and writes them into that container's
`EnvVariables`. The core knows no environments: a project's provider chooses stores and keys however
its conventions require.

- **Precedence:** a non-empty variable already set wins over its secret and is reported by name.
  Because Bun loads `.env` first, this report is what exposes a leftover `.env`.
- **All or nothing:** every read completes before anything is written; a missing secret or a failed
  read throws and leaves `EnvVariables` untouched. Errors and logs carry names, never values.
- **Cache:** `cached(store, { ttl })` keeps values in the OS keychain, so a dev server restart makes
  no store call. The user asked for it; the TTL is required, with no default, so every repo chooses
  how stale a value may be.
- **Commands:** `defineSecretsCommands({ provider })` gives `secrets login|set|list|import|run|refresh`,
  registered as a plugin or in a product CLI.

## Consequences

- An app calls `loadSecrets` explicitly; production, which gets its variables from its platform,
  skips it.
- A variable left in `.env` or the shell silently shadows the store except for the reported name.
- The keychain cache trusts every process that may read keychain items written by `bun`
  (`packages/secrets/README.md`).
- A new backend is a new `SecretStore`; Bitwarden is the first (`own-bitwarden-client-over-bws.md`),
  AWS is planned as a separate store.
