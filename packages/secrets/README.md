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
  wins over its secret, and its name is reported in the `Secrets loaded` log (`overridden`). Bun loads
  `.env` before any code runs, so a name listed there usually means a leftover `.env`.
- **All or nothing:** every read completes before anything is written. A failed read throws and leaves
  `EnvVariables` untouched.
- **No values in output:** errors and logs carry names and store ids, never values.
- **Reads only:** the startup step never writes to a store.

## Cache

`cached(store, { ttl })` keeps the whole `readAll` result of a store in the OS keychain (through `Bun.secrets`,
service `nzyme-secrets`) as one item per store id and prefix, so restarting a dev server makes no store call. A
write deletes the item. `ttl` is in milliseconds and required. A keychain failure or a malformed item only warns;
the read falls through to the store. `secrets refresh` re-reads before the TTL runs out. A store larger than
Windows Credential Manager's 2560-byte item cap will not cache on Windows (it only warns).

Values are kept only in the keychain, never in a file. Any `bun` process of the same user can read them without a prompt: on macOS (Bun 1.4.4, checked 2026-11-02) a separate `bun` script read the tokens that `nzyme secrets login` had stored. The keychain protects them from other users and from a stolen disk, not from code you run. Linux is not checked yet.

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
plugin's commands must extend the `Command` of the same `@nzyme/cli-core` the binary runs. Why:
`docs/decisions/nzyme-cli-plugins.md`.

A product CLI registers the same commands itself:

```ts
await execute({
    name: 'app',
    commands: [...appCommands, ...defineSecretsCommands({ provider: AppSecrets })],
});
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
  comes from a hidden prompt, or from stdin: `nzyme secrets set DB_PASSWORD < password.txt`.
- **`secrets set <NAME> --prompt[=<hint>]`** — how an agent asks the user for a secret: the user
  types it into a native masked dialog (osascript on macOS, Get-Credential on Windows, zenity or
  kdialog on Linux; a hidden terminal prompt when none opens), so the value never reaches the
  agent's transcript. Stdin is ignored. The hint says what the value is and where to find it, and
  needs the `=`: `--prompt="Staging DB password, in 1Password"` (`--prompt "…"` is a usage error).
  On success it prints only the name, store and character count. It exits 1, writing nothing,
  when nothing was entered (cancelled, blank or timed out after 5 minutes), when the value spans
  several lines, or when no dialog or terminal is available — then ask the user to run
  `nzyme secrets set <NAME>` in their own terminal and confirm with `nzyme secrets list`.
- **`secrets list`** — every key of every store with its store id, and `overridden by environment`
  when the variable is set. It does not know which keys a project expects, so it reports no missing
  ones; a project can add its own check command.
- **`secrets run -- <command>`** — runs a command with all stores merged (earlier wins) as environment
  variables. A variable already set wins; every store's credentials (`BWS_ACCESS_TOKEN`) are removed
  from the child's environment; nothing starts when a store cannot be read. The exit code is the
  command's own.
- **`secrets refresh`** — re-reads every store that caches.

The startup step, `run` and `list` only read; only `set` writes. A store keeps one
credential per machine, so a machine that only runs the app logs in with read-only credentials (for
Bitwarden, a read-only machine account) and its writes are refused.

## Stores

- [`@nzyme/bitwarden`](../bitwarden/README.md) — Bitwarden Secrets Manager.
- `parameterStore` from `@nzyme/aws/ssm.js` — AWS Systems Manager Parameter Store: a path prefix (`/secrets/dev/`, direct children only) or a name prefix (`FOOBAR_`); credentials from the AWS provider chain or a `profile`, no `login`; an explicit `endpoint` keeps the store on real AWS when `AWS_ENDPOINT_URL` points the process at an emulator.

A store is an object implementing `SecretStore` (`id`, `prefix`, `readAll`, `write`, optional `login`,
`refresh`, `credentialEnv`).
