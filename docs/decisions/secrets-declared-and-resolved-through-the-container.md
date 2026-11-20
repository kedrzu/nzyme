# Secrets declared in a secrets package and resolved through the container

## Status

Accepted. Supersedes [`secrets-as-code-through-env-variables.md`](secrets-as-code-through-env-variables.md).

## Context

`secrets-as-code-through-env-variables.md` loaded a store's secrets into the container's `EnvVariables`, so
code kept reading them through `defineEnvVariable` or `process.env`. Since then:

- Healed keeps its secrets as typed keys of a config document (`@nzyme/config`), each declared once with its
  own `defineSecret`, resolved through the container. Its write policy and `secrets check` are built on that
  list.
- The other product repos (githq, 12-krokow, poweragents, neolithic) had no list of their secrets. Their code
  read secrets from `process.env`, from a Cloudflare Worker's raw bindings and from Nuxt's `useRuntimeConfig()`,
  each a different path, and their Bun scripts needed a `secrets run` wrapper to receive anything.
- The commands moved out of the `nzyme` binary into each product's CLI
  ([`product-clis-over-nzyme-plugins.md`](product-clis-over-nzyme-plugins.md)).

> **Checked 2026-11-20:** none of healed, githq, 12-krokow, poweragents and neolithic imports
> `@nzyme/secrets/loadSecrets.js` (`git grep` of each repo's `origin/main`). githq, 12-krokow and healed each
> carried their own copy of `resolveOptionalSecret`, and githq, 12-krokow, poweragents and neolithic each their
> own loader of the same four lines.

## Options Considered

- **Keep loading into `EnvVariables`.** No change for code that reads `process.env`. Trade-off: secrets stay
  indistinguishable from other variables, nothing lists them, and every runtime keeps its own way in.
- **Declare every secret with `defineSecret` and resolve it through the container.** One list per repo, one
  way in for every runtime the repo owns. Trade-off: each runtime must build a container and load its config
  first, including a Worker that had none.

The owner chose the second.

## Decision

- **Declarations:** every secret is a `defineSecret` export of `secrets.ts` in the repo's secrets package,
  `packages/secrets` (`@<product>/secrets`). That module holds declarations only, so a Worker or Nitro bundle
  imports it without store code. The package also holds the stores service and the variable that picks the
  environment.
- **Runtime reads go through the container:** `container.resolve(SECRET)` or a service's `deps`, never
  `process.env`, a raw binding or `useRuntimeConfig()`. Code that runs without a secret on purpose uses
  `resolveOptionalSecret`.
- **Loading:**
  - A process that reads its secrets itself (a Bun script, a CLI command) calls
    `loadSecretsConfig(container, stores)` from `@nzyme/secrets`: the environment variables, then the stores,
    so a variable set in the shell wins. With `CI` set the stores are not read; a job's secrets come as
    environment variables.
  - A runtime with no store access builds its container from what its platform hands it: a Worker from its
    bindings, a Nitro server from its runtime config.
  - Only external tools (wrangler, Tauri, a Python script, a CI shell step) get secrets as environment
    variables, through `bun secrets run` locally or job `env` in CI.
- **No env files:** credentials never live in `.env` or `.dev.vars`, and setup scripts do not copy them.

## Consequences

- One list of secrets per repo, which `secrets set`, `secrets run -- <cmd>` and `secrets list` follow.
- Bun scripts lose their `bun secrets run` wrappers. The wrappers that remain mark external tools.
- A Worker gains `@nzyme/ioc` and `@nzyme/config` in its bundle (githq's stayed about 20 KB, with no store code).
- `loadSecrets` (into `EnvVariables`) stays exported for now, unused by the product repos; removing it is a
  breaking change for another day.
- Healed keeps its own `defineSecret` (with `personal`) and its richer loader, built on the same primitives.
