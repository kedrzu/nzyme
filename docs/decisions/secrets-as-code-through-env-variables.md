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
(the `resolve` function in `packages/ioc/src/defineEnvVariable.ts`), which defaults to `process.env`.

## Options Considered

- **A static declaration file** (`secrets.yaml` with `providers`, `secrets` and `environments`,
  proposed by a Design-It-Twice panel), with environments in the core. Language-neutral and readable
  without running code. Rejected by the user: the core would have to model environments, and Healed's
  environment and AWS-account conventions do not fit a generic model. Config as code lets each repo
  express its own conventions in TypeScript.
- **A `defineSecretsProvider` helper.** Rejected in favour of a plain service,
  `defineService<SecretsMapping>(…)`: no new concept, and the mapping can depend on other services
  and env variables.
- **A `SecretsProvider` ioc interface** for the project to implement. Dropped once `loadSecrets` and
  the commands took the provider explicitly: nothing resolved the interface any more.
- **A mapping drawing from several stores**, by alias, each secret referencing its store. Dropped in
  review: only Bitwarden exists, and the aliases, the per-store grouping and `login <alias>` served
  a second store no repo has yet. A mapping has one store; a second store, when one arrives, is a
  new decision.
- **A startup step as a command.** Rejected: see the root-container check above.
- **A new source inside `defineEnvVariable`.** Rejected: writing into `EnvVariables` before anything
  resolves keeps `defineEnvVariable` unchanged.

## Decision

`@nzyme/secrets` defines the `SecretStore` contract, the `SecretsMapping` type (one store, and
each env-variable name to its key in that store) and `loadSecrets(container, provider)`, a plain function an
app calls at startup. It takes the provider explicitly, as `defineSecretsCommands({ provider })` does,
so there is no registration to forget. It reads every mapped secret in one batch and writes them into that container's
`EnvVariables`. The core knows no environments: a project's provider chooses the store and keys however
its conventions require.

- **Precedence:** a non-empty variable already set wins over its secret and is reported by name.
  Because Bun loads `.env` first, this report is what exposes a leftover `.env`.
- **All or nothing:** every read completes before anything is written; a missing secret or a failed
  read throws and leaves `EnvVariables` untouched. Errors and logs carry names, never values.
- **Cache:** `cached(store, { ttl })` keeps values in the OS keychain, so a dev server restart makes
  no store call. The user asked for it; the TTL is required, with no default, so every repo chooses
  how stale a value may be.
- **Commands:** `defineSecretsCommands({ provider })` gives `secrets login|set|list|run|refresh`,
  registered as a plugin or in a product CLI.

## Consequences

- An app calls `loadSecrets` explicitly; production, which gets its variables from its platform,
  skips it.
- A variable left in `.env` or the shell silently shadows the store except for the reported name.
- The keychain cache trusts every process that may read keychain items written by `bun`
  (`packages/secrets/README.md`).
- A new backend is a new `SecretStore`; Bitwarden is the first (`own-bitwarden-client-over-bws.md`),
  AWS is planned as a separate store.

## Update 2026-11-09: a prefix instead of a mapping, stores as config sources

Superseded in the Decision above: `SecretsMapping` and the per-name key mapping are gone, and a store is
no longer read key by key.

- **Why:** a name-to-key mapping must be kept in step with every `defineEnvVariable` declaration, and
  it only let a project say which secrets exist, which a prefix says by itself. The repo that uses
  these stores most (Healed) keeps its secrets as typed metadata on a config document
  (`@nzyme/config`), where the name is already the key.
- **A store is scoped by a prefix.** `SecretStore` has an arbitrary `prefix` (a path such as
  `/secrets/dev/`, a name prefix such as `FOOBAR_`, or empty for the whole store), `readAll()` returns
  every secret under it keyed without the prefix, and `write` takes keys without it. Stores read in one
  batch, so Bitwarden keeps its request count (list plus one fetch) and a Parameter Store
  store can use `GetParametersByPath`.
- **Stores are config sources.** `secretsSource(store)` is a `ConfigSource`, so a repo with a config
  document puts a store among its sources and lets the document's precedence order them. `loadSecrets
  (container, stores)` stays for repos without one: it takes a list of stores, the earlier wins a
  duplicate key, and the rest of its behaviour (an already-set variable wins and is reported, all or
  nothing) is unchanged.
- **Several stores, and the project owns the write policy.** The commands take a `SecretsProvider`:
  `stores` and `target(name)`, which returns the store a key is written to or throws to refuse it.
  This reverses the earlier "a mapping has one store" because the tier-per-store case now exists.
  `list` shows every key with its store; `run` merges the stores (earlier wins) and strips every
  store's credentials. `list` no longer reports missing secrets: nothing in nzyme knows which keys a
  project expects, so a project that wants the check adds its own command.
- **Cache:** `cached` stores the whole `readAll` result in the keychain per store id and prefix (an
  index item plus one item per value, because of per-item size caps). A write invalidates it.
- **Breaking:** `bitwarden({ project })` gains `prefix`; `SecretStore.read(keys)` becomes `readAll()`.
