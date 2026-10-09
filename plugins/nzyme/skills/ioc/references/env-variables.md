# Environment variables

Read when a variable needs `parse`, is optional, or you need the exact type each option produces. The
core rule (inject via `deps`, never `process.env`; a bare call is required) is in the ioc `SKILL.md`.

## How resolution works

`defineEnvVariable(name, options?)` (`@nzyme/ioc/defineEnvVariable.js`) returns an injectable that,
when resolved, reads `name` from the `EnvVariables` interface (`@nzyme/ioc/helpers/EnvVariables.js`,
defaulting to `process.env`):

1. Value missing **or an empty string** → return `default()` if there is one (not passed through
   `parse`); else throw if required.
2. Otherwise → `parse(value)` if given, else the raw string.

An optional variable with no default that is unset reaches step 2 with `undefined` — so its `parse`
is called with `undefined` and must handle it.

## Options and the types they produce

```ts
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';

// Required (bare call) → string; throws at resolution when unset
export const API_KEY = defineEnvVariable('API_KEY');

// Default → string; the default is returned as-is, never parsed — give it the parsed type
export const BASE_URL = defineEnvVariable('BASE_URL', { default: 'https://api.example.com' });
export const TIMEOUT_MS = defineEnvVariable('TIMEOUT_MS', { parse: Number, default: 30_000 });

// Parse alone keeps it required → the parsed type
export const QUEUE_URLS = defineEnvVariable('QUEUE_URLS', {
    parse: value => JSON.parse(value) as Record<string, string>,
});

// Boolean flag with a default — a falsy default must be a function (see the warning below)
export const DEBUG_MODE = defineEnvVariable('DEBUG_MODE', { parse: value => value === 'true', default: () => false });

// Optional → still typed `string`, but `undefined` at runtime when unset
export const SENTRY_DSN = defineEnvVariable('SENTRY_DSN', { required: false });
```

**Falsy defaults:** a literal falsy `default` (`false`, `0`, `''`) is dropped and the variable becomes
required, so resolution throws when it is unset. Pass a function instead (`default: () => false`).

**Type hole:** `required: false` does not add `| undefined` to the resolved type — the dependency is
typed `string` (or the parsed type) while the runtime value can be `undefined`. Treat an optional
variable as possibly missing at the use site, or give it a `default` so the type is honest.
`{ required: true }` is redundant on a bare call; it only documents intent.

## Organization

One `env.ts` per package declares the variables that package reads. Plain constants that aren't
environment-driven may sit in the same file as ordinary `const`s.

```ts
// packages/catalog/src/env.ts
export const CATALOG_API_KEY = defineEnvVariable('CATALOG_API_KEY');
export const CATALOG_API_URL = defineEnvVariable('CATALOG_API_URL', { default: 'https://api.example.com' });
export const CATALOG_PAGE_SIZE = 50; // fixed constant, not env-driven
```

Variables are injected like any other dependency and arrive resolved:

```ts
export const CatalogClient = defineService({
    name: 'CatalogClient',
    deps: { apiKey: CATALOG_API_KEY, baseUrl: CATALOG_API_URL },
    setup({ apiKey, baseUrl }) {
        return createCatalogClient({ apiKey, baseUrl });
    },
});
```

In tests, provide values through the container — `container.set(EnvVariables, { CATALOG_API_KEY: 'k' })`
— instead of mutating `process.env`, which leaks across tests in the same process. `container.set` on
the variable itself has no effect: env variables are plain injectables whose `resolve` ignores the
container.

## Bad patterns

```ts
// process.env directly — no typing, no required-check, no test override
const apiKey = process.env.API_KEY;

// Hand-rolled required check — a bare defineEnvVariable already throws when unset
deps: { apiKey: defineEnvVariable('API_KEY', { required: false }) },
setup({ apiKey }) {
    if (!apiKey) throw new Error('API_KEY required');
}
```
