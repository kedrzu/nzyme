# @nzyme/secrets

Development secrets kept in a remote store behind a login, configured as code and loaded into the
environment variables an app already reads through `defineEnvVariable`. No plaintext `.env`, nothing
encrypted in the repo.

Why it works this way: `docs/decisions/secrets-as-code-through-env-variables.md`.

## Installation

```bash
bun add @nzyme/secrets @nzyme/bitwarden
```

Every `@nzyme/*` package in a repo, `@nzyme/cli` included, must be one version, installed in the repo
(see [Commands from a plugin](#commands-from-a-plugin)).

## The mapping

A project describes its secrets in a service implementing `SecretsProvider`: stores by alias, and the
environment variable each secret is loaded into.

```ts
// packages/app/src/AppSecrets.ts
import { defineService } from '@nzyme/ioc/Service.js';
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';
import { SecretsProvider } from '@nzyme/secrets/SecretsProvider.js';
import { cached } from '@nzyme/secrets/cached.js';

export const AppSecrets = defineService({
    name: 'AppSecrets',
    implements: SecretsProvider,
    setup() {
        const bw = cached(bitwarden({ project: '1f0c…' }), { ttl: 8 * 60 * 60 * 1000 });

        return {
            stores: { bw },
            secrets: {
                DATABASE_URL: bw.secret(),
                STRIPE_KEY: bw.secret('stripe-test-key'),
            },
        };
    },
});
```

`store.secret()` uses the variable name as the key in the store; `store.secret(key)` names another
key. The core knows no environments: a project picks stores and keys however its own conventions
require, for example by depending on an env variable in `deps`.

## Loading at startup

```ts
import { loadSecrets } from '@nzyme/secrets/loadSecrets.js';

container.register(AppSecrets);
await loadSecrets(container);
```

`loadSecrets` reads every mapped secret, one batch per store, and writes them into that container's
`EnvVariables`, so `defineEnvVariable` resolves them. Call it after registering the provider and
before resolving anything that reads those variables. Production, whose platform provides the
variables, skips it.

- **Precedence:** a non-empty variable already set wins over its secret, and its name is reported in
  the `Secrets loaded` log (`overridden`). Bun loads `.env` before any code runs, so a name listed
  there usually means a leftover `.env`.
- **All or nothing:** every read completes before anything is written. A secret that is missing or
  empty, or a failed read, throws naming the variable, key and store, and leaves `EnvVariables`
  untouched.
- **No values in output:** errors and logs carry names and references, never values.
- **Read-only:** the startup step uses a store's read-only credentials.

## Cache

`cached(store, { ttl })` keeps the values of a store in the OS keychain (through `Bun.secrets`,
service `nzyme-secrets`), so restarting a dev server makes no store call. `ttl` is in milliseconds and
required. A keychain failure only warns; the read falls through to the store. `secrets refresh`
re-reads before the TTL runs out.

Values are kept only in the keychain, never in a file. Which other processes can read them:

<!-- TODO(smoke test): which other processes of the same user can read keychain items written by `bun`, on macOS and on Linux. -->

## Commands from a plugin

A repo without its own CLI gets the commands from the `nzyme` binary through a plugin module:

```ts
// tools/secrets.ts
import type { NzymePlugin } from '@nzyme/cli-core/NzymePlugin.js';
import { defineSecretsCommands } from '@nzyme/secrets/commands/defineSecretsCommands.js';

import { AppSecrets } from '../packages/app/src/AppSecrets.js';

export default { commands: defineSecretsCommands({ provider: AppSecrets }) } satisfies NzymePlugin;
```

```json
{
    "nzyme": {
        "plugins": ["./tools/secrets.ts"]
    }
}
```

`@nzyme/cli` and every other `@nzyme/*` package must be one version, installed in the repo: the
plugin's commands must extend the `Command` of the same `@nzyme/cli-core` the binary runs. The binary
detects a second copy and names this fix. Why: `docs/decisions/nzyme-cli-plugins.md`.

A product CLI registers the same commands itself:

```ts
await execute({
    name: 'app',
    commands: [...appCommands, ...defineSecretsCommands({ provider: AppSecrets })],
});
```

## Commands

Values are never taken from arguments and never printed.

- **`secrets login [store] [--write]`** — stores credentials for a store (the alias is optional with
  one store), read-only unless `--write`. The token is read from a hidden prompt, or from stdin.
- **`secrets set <NAME>`** — writes one mapped secret (read-write token). The value comes from a
  hidden prompt, or from stdin: `nzyme secrets set DB_PASSWORD < password.txt`.
- **`secrets list`** — each mapped name with its store, key and status (`resolves`, `missing`,
  `overridden by environment`); exits non-zero when one is missing. Read-only token.
- **`secrets import [--file .env] [--store bw]`** — writes every non-empty variable of a dotenv file
  to a store (read-write token), skips store credentials, and prints the mapping lines to paste. The
  file is left in place; delete it once the import is verified.
- **`secrets run -- <command>`** — runs a command with the mapped secrets as environment variables
  (read-only token). A variable already set wins; store credentials (`BWS_ACCESS_TOKEN`) are removed
  from the child's environment; nothing starts when a secret is missing. The exit code is the
  command's own.
- **`secrets refresh`** — re-reads the mapped secrets of every caching store.

The startup step, `run` and `list` use the read-only token; only `set` and `import` need the
read-write one, so a machine that only runs the app needs no write access.

## Stores

- [`@nzyme/bitwarden`](../bitwarden/README.md) — Bitwarden Secrets Manager.

A store implements `SecretStore` (`read`, `write`, optional `login`, `refresh`, `credentialEnv`)
through `defineSecretStore`, which adds `secret()`.
