# @nzyme/config

A typed config document assembled per runtime from ordered sources, and read through the container.
Secret or not, code reads every setting the same way.

## Defining config

```ts
import { defineConfig } from '@nzyme/config/defineConfig.js';

export const ApiUrl = defineConfig('API_URL');
export const Features = defineConfig<{ readonly beta: boolean }>('FEATURES');
export const Sentry = defineConfig('SENTRY_DSN', { required: false });
export const DbPassword = defineConfig('DB_PASSWORD', { meta: { secret: true } });
```

A definition is an injectable: list it in `deps` of a service and it resolves to the value. A missing
required key throws naming the key and the caller; an optional one resolves to `undefined`. `meta` is
typed through to `definition.meta`, for facts a tool needs about the key (an empty object when none
is given).

## The document

`RuntimeConfig` is the immutable JSON document (`Readonly<Record<string, JsonValue>>`) a runtime
installs on its container. It has no default: a runtime that resolves a key without installing a
document fails naming the interface.

## Sources and precedence

A `ConfigSource` is a name and a `load()` returning entries.

- `envSource(env?)`: the string-valued entries of the environment (default `process.env`).
- `fileSource({ path, optional? })`: a JSON document; an absent optional file contributes nothing.
  The file name is the caller's. `readConfigFile` reads one directly.
- Other packages provide their own, e.g. a secret store.

Precedence is list order: the first source owning a key wins. A key also present in a later source is
reported by name as overridden.

## Loading

```ts
import { loadConfig } from '@nzyme/config/loadConfig.js';

await loadConfig(container, [
    fileSource({ path: '.config.json', optional: true }),
    envSource(),
]);
```

`loadConfig` installs the merged document as `RuntimeConfig` and logs one `Config loaded` debug line (the CLI logger shows it with `LOGGING=true`) with
the source names, the key count and the overridden key names. No value ever reaches a log line or
an error message. It is a plain async function, not a command, so it works on any container.
