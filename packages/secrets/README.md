# @nzyme/secrets

Development secrets kept in a remote store behind a login, configured as code and loaded into the
environment variables an app already reads through `defineEnvVariable`. No plaintext `.env`, nothing
encrypted in the repo.

Why it works this way: `docs/decisions/secrets-as-code-through-env-variables.md`.

## Installation

```bash
bun add @nzyme/secrets @nzyme/bitwarden
```

Every `@nzyme/*` package in a repo must be one version: the commands must extend the `Command` of the
same `@nzyme/cli-core` the product CLI runs (see [Commands in the product CLI](#commands-in-the-product-cli)).

## Stores and prefixes

A `SecretStore` is one place secrets live, scoped to a **prefix**: it reads every secret under the
prefix and writes keys under it, and the keys it hands out carry no prefix. The prefix is arbitrary:
a path such as `/secrets/dev/`, a name prefix such as `FOOBAR_`, or empty for the whole store. There
is no mapping from variable names to keys: the key is the name.

```ts
// packages/app/src/AppStores.ts
import { defineService } from '@nzyme/ioc/Service.js';
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';
import { cached } from '@nzyme/secrets/cached.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

export const AppStores = defineService<SecretStore[]>({
    name: 'AppStores',
    setup: () => [cached(bitwarden({ project: '1f0c…', prefix: 'DEV_' }), { ttl: 8 * 60 * 60 * 1000 })],
});
```

The core knows no environments: a project picks the stores and prefixes however its own conventions
require, for example by depending on an env variable in `deps`.

## In a config document

A repo with a `defineConfig` document (`@nzyme/config`) uses a store as one of its sources:

```ts
import { secretsSource } from '@nzyme/secrets/secretsSource.js';

sources: [envSource(), secretsSource(store)];
```

`secretsSource(store)` loads every secret under the store's prefix as config entries by key, and
the `Config loaded` log names the source `secrets:<store id>`. Order the sources as the document's precedence
wants: the first source with a key wins.

## Loading into env variables

A repo without a config document loads the stores into the environment variables its code already
reads through `defineEnvVariable`:

```ts
import { loadSecrets } from '@nzyme/secrets/loadSecrets.js';

await loadSecrets(container, container.resolve(AppStores));
```

`loadSecrets` reads every store in parallel and writes the secrets into that container's
`EnvVariables`, so `defineEnvVariable` resolves them by key. Call it before resolving anything that
reads those variables. Production, whose platform provides the variables, skips it.

- **Precedence:** for a key in several stores the earlier store wins. A non-empty variable already set
  wins over its secret, and its name is reported in the `Secrets loaded` debug log (`overridden`). Bun loads
  `.env` before any code runs, so a name listed there usually means a leftover `.env`.
- **All or nothing:** every read completes before anything is written. A failed read throws and leaves
  `EnvVariables` untouched.
- **No values in output:** errors and logs carry names and store ids, never values.
- **Reads only:** the startup step never writes to a store.

## Cache

`cached(store, { ttl })` keeps the whole `readAll` result of a store in the OS keychain (through `Bun.secrets`,
service `nzyme-secrets`) as one item per store id, so restarting a dev server makes no store call. A
write deletes the item. `ttl` is in milliseconds and required. A keychain failure or a malformed item only warns;
the read falls through to the store. `secrets refresh` re-reads before the TTL runs out. A store larger than
Windows Credential Manager's 2560-byte item cap will not cache on Windows (it only warns).

Values are kept only in the keychain, never in a file. Any `bun` process of the same user can read them without a prompt: on macOS (Bun 1.4.4, checked 2026-11-02) a separate `bun` script read the tokens that `secrets login` had stored. The keychain protects them from other users and from a stolen disk, not from code you run. Linux is not checked yet.

## Commands in the product CLI

The `nzyme` binary loads no project code. A repo registers the commands in its own CLI (a
`packages/cli` workspace package with a `bin`), and adds the wrapper `"secrets": "<product> secrets"` to
the root `package.json`, so they run as `bun secrets …` in every repo. A sub-package's own scripts
call the binary instead (`<product> secrets run -- …`): Bun looks up scripts only in the nearest
`package.json`.

```ts
// packages/cli/src/cli.ts
#!/usr/bin/env -S bun --conditions=source
import { execute } from '@nzyme/cli-core/execute.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';

import { AppSecrets } from '../../app/src/AppSecrets.js';

await execute({
    name: 'app',
    commands: [...appCommands, ...defineSecretsCommands({ provider: AppSecrets })],
});
```

The commands below are written as `secrets …`; run them as `bun app secrets …`. Why a product CLI and
not a plugin of `nzyme`: `docs/decisions/product-clis-over-nzyme-plugins.md`.

## Declaring secrets

Declare each secret the repo uses, in one module, with `defineSecret`. The export name is the secret's
name and the key in the stores:

```ts
// packages/app/src/secrets.ts
import { defineSecret } from '@nzyme/secrets/defineSecret.js';

export const DB_PASSWORD = defineSecret('DB_PASSWORD', { description: 'Staging database password' });
export const STRIPE_KEY = defineSecret('STRIPE_KEY', {
    description: 'Stripe test key',
    enabled: env => env.APP_ENV !== 'prod',
});
```

- **`defineSecret(name, options)`** is also a `defineConfig` key of type string: resolving a secret
  that no store holds throws, naming `secrets set`.
- **`description`** documents the secret. **`enabled(env)`** receives the command's environment
  variables and says whether the secret applies in this environment (default: always).
- **`meta`** holds project data (a flat object), for example which store a secret belongs to. The keys
  `secret`, `description` and `enabled` are reserved and a type error there.

`secretsProvider` builds the provider from the declarations and one store, which it reads and writes:

```ts
// packages/app/src/AppSecrets.ts
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { cached } from '@nzyme/secrets/cached.js';
import { getSecretDefinitions } from '@nzyme/secrets/getSecretDefinitions.js';
import { secretsProvider } from '@nzyme/secrets/commands/secretsProvider.js';

import * as secrets from './secrets.js';

/** `dev` or `prod`: picks the prefix, so `prod` secrets are out of reach in `dev`. */
const APP_ENV = defineEnvVariable('APP_ENV', { default: 'dev' });

export const AppSecrets = defineService({
    name: 'AppSecrets',
    deps: { env: APP_ENV },
    setup: ({ env }) =>
        secretsProvider({
            secrets: getSecretDefinitions(secrets),
            store: cached(bitwarden({ project: '1f0c…', prefix: `APP_${env.toUpperCase()}_` }), {
                ttl: 8 * 60 * 60 * 1000,
            }),
        }),
});
```

Environments that differ by prefix are different stores chosen here, by the provider.

With declarations the commands follow them:

- **`set`** refuses a name that is not declared or not enabled, before any prompt or write.
- **`run -- <command>`** with no keys runs with every declared, enabled secret; named keys must be
  declared and enabled.
- **`list`** prints the declared, enabled secrets with the store id, `missing`, or
  `overridden by environment`, then the stored keys that are `not declared` or `not enabled here`.
  The exit code is 0.

Without declarations (a provider with only `stores` and `target`) the commands behave as described
below.

**Several stores.** nzyme does not route between stores. A project writes its own composite
`SecretStore` that picks a store per key from the secret's `meta`, for example personal tokens in
`keychainStore` beside shared ones in Bitwarden:

```ts
// secrets.ts: export const GITHUB_TOKEN = defineSecret('GITHUB_TOKEN', { meta: { store: 'personal' } });
const personalKeys = new Set(
    getSecretDefinitions(secrets)
        .filter(secret => 'store' in secret.meta && secret.meta.store === 'personal')
        .map(secret => secret.name),
);

const store: SecretStore = {
    id: `${shared.id}+${personal.id}`,
    async readAll() {
        const [fromShared, fromPersonal] = await Promise.all([shared.readAll(), personal.readAll()]);
        return new Map([...fromShared, ...[...fromPersonal].filter(([key]) => personalKeys.has(key))]);
    },
    async write(entries) {
        await personal.write(entries.filter(({ key }) => personalKeys.has(key)));
        await shared.write(entries.filter(({ key }) => !personalKeys.has(key)));
    },
};
```

## Commands

Values are never taken from arguments and never printed. The `provider` service resolves to a
`SecretsProvider`: `stores` (every store, most preferred first) and `target(name)`, the project's write
policy.

```ts
export const AppSecrets = defineService<SecretsProvider>({
    name: 'AppSecrets',
    setup() {
        const dev = cached(bitwarden({ project: '1f0c…', prefix: 'DEV_' }), { ttl });
        return {
            stores: [dev],
            target(name) {
                if (!name.startsWith('SECRET_')) {
                    throw new UsageError(`${name} is not a secret.`);
                }
                return dev;
            },
        };
    },
});
```

- **`secrets login`** — stores credentials for every store that has a `login`. The token is read from
  a hidden prompt, or from stdin.
- **`secrets set <NAME>`** — writes one secret to the store `target(NAME)` returns, under the key
  `NAME`; `target` throws a `UsageError` to refuse the name, and then nothing is written. The value
  comes from a hidden prompt, or from stdin: `secrets set DB_PASSWORD < password.txt`.
- **`secrets set <NAME> --prompt[=<hint>]`** — how an agent asks the user for a secret: the user
  types it into a native masked dialog (osascript on macOS, Get-Credential on Windows, zenity or
  kdialog on Linux; a hidden terminal prompt when none opens), so the value never reaches the
  agent's transcript. Stdin is ignored. The hint says what the value is and where to find it, and
  needs the `=`: `--prompt="Staging DB password, in 1Password"` (`--prompt "…"` is a usage error).
  On success it prints only the name, store and character count. It exits 1, writing nothing,
  when nothing was entered (cancelled, blank or timed out after 5 minutes), when the value spans
  several lines, or when no dialog or terminal is available — then ask the user to run
  `secrets set <NAME>` in their own terminal and confirm with `secrets list`.
- **`secrets list`** — every key of every store with its store id, and `overridden by environment`
  when the variable is set. It does not know which keys a project expects, so it reports no missing
  ones; a project can add its own check command.
- **`secrets run <KEY>... -- <command>`** — runs a command with the named secrets as environment
  variables, and no other secret, so a wrapper hands a tool exactly what it needs. For a key in
  several stores the earlier store wins; a variable already set wins; every store's credentials
  (`BWS_ACCESS_TOKEN`) are removed from the child's environment; nothing starts when a store cannot
  be read or a named key is in no store. The exit code is the command's own.
- **`secrets refresh`** — re-reads every store that caches.

The startup step, `run` and `list` only read; only `set` writes. A store keeps one
credential per machine, so a machine that only runs the app logs in with read-only credentials (for
Bitwarden, a read-only machine account) and its writes are refused.

## Stores

- `keychainStore` from `@nzyme/secrets/keychainStore.js` — the OS keychain of the current user (see [Keychain store](#keychain-store)).
- [`@nzyme/bitwarden`](../bitwarden/README.md) — Bitwarden Secrets Manager.
- `parameterStore` from `@nzyme/aws/ssm.js` — AWS Systems Manager Parameter Store: a path prefix (`/secrets/dev/`, direct children only) or a name prefix (`FOOBAR_`); credentials from the AWS provider chain or a `profile`, no `login`; an explicit `endpoint` keeps the store on real AWS when `AWS_ENDPOINT_URL` points the process at an emulator.

A store is an object implementing `SecretStore` (`id` (which includes the prefix), `readAll`, `write`, optional `login`,
`refresh`, `credentialEnv`).

## Keychain store

The simplest store: secrets of one user on one machine, kept in the OS keychain (through `Bun.secrets`,
service `nzyme-secrets`). No account, no credentials, no network.

```ts
import { keychainStore } from '@nzyme/secrets/keychainStore.js';

const dev = keychainStore({ scope: 'myapp-dev' });
const personal = keychainStore({ scope: 'personal' });
```

- **Scope:** each scope is an independent set of keys, with the store id `keychain:<scope>`. A scope must
  not be empty, blank or contain `:`.
- **Layout:** one keychain item per secret, `keychain:<scope>:<key>`, holding the raw value, so each one
  is visible and editable in Keychain Access. `Bun.secrets` cannot list items, so the item
  `keychain:<scope>` holds the scope's keys as a JSON array. A key listed there whose item is gone is
  skipped; a malformed list makes reads and writes fail, naming the store, and a write never replaces it.
- **Writes:** value items first, the key list last, so an interrupted write never lists a key without a
  value. A write that fails part-way keeps the values written before the failure, and two concurrent
  writes to one scope can drop a key from the list. Writing the key again repairs both.
- **No `login`:** the OS session unlocks the keychain. Wrapping the store in `cached()` gains nothing.
- **Bun only:** outside Bun the store throws when read or written.

The keychain protects the values from other users and from a stolen disk, not from code you run (see
[Cache](#cache)). There is no way to share the secrets with another machine or person: use a remote
store for that.
