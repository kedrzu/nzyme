---
name: ioc
description: >-
    Dependency injection with @nzyme/ioc — defineCommand (one operation), defineService (several
    methods or held state), defineFactory (per-call instances), defineInterface, the contract `Shape`
    annotation, deps, defineEnvVariable, container.set overrides and mocking with @nzyme/ioc-testing,
    plus shared reactive stores built on createEventEmitter/createSingleRunner from @nzyme/utils. Use
    when writing or reviewing code that imports @nzyme/ioc, @nzyme/ioc-testing or @nzyme/vue-ioc:
    creating a service or command, wiring dependencies, injecting env variables, naming `*Command.ts` /
    `*Service.ts` / `*Endpoint.ts` files, overriding a dependency in a test, or building a store shared
    across Vue components. Not for: reactive logic owned by one component (composables skill).
---

# IoC (dependency injection)

`@nzyme/ioc` wires units through a container instead of direct imports. A unit declares what it needs
in `deps`; the container resolves them. The fact everything below depends on: **services, commands
and factories are singletons per container** — `setup()` runs once, its result is cached, and any
state or connection held in the closure is shared by every caller.

## When NOT to use

- **A pure function with no dependency to invert** → a plain exported function with
  `@__NO_SIDE_EFFECTS__`, imported directly. Wrapping a formatter, validator or parser in
  `defineCommand` adds container indirection and buys nothing — there is nothing to inject or swap in
  tests.
- **Reactive state owned by one component** → composables skill (`use[Feature]`, torn down with the
  component). A `defineService` store is for state *shared across components* for the container's
  lifetime.
- **A fixed internal constant** (timeout, cache size) → a plain `const`, not an injectable.

## Command vs service vs factory

First match wins:

|If the unit…|Use|Why|
|-|-|-|
|does **one thing**, called as a single function|`defineCommand`|the unit *is* the callable; a one-method service is noise|
|exposes **several methods** OR **holds state/connections** across calls|`defineService`|the singleton closure is the shared state|
|must produce a **fresh instance per call** from runtime args|`defineFactory`|deps resolve once, `setup(deps, ...args)` runs per call|

Reach for a service the moment a second related method or any long-lived state (a cache, a socket,
reactive refs) appears — two commands cannot see each other's closure.

**One-method unit that holds state → still a service.** A `SessionContext` exposing only `get()` over
the current session is ambient state other units inject and read, not a one-shot operation. Rule of
thumb: a *thing* callers hold (`…Context`, `…Store`, `…Client`) is a service; a *verb* (`…Command`) is a
command.

## File naming

Examples for a "Product" domain:

|Pattern|Example|Holds|
|-|-|-|
|`*Command.ts`|`ProductCreateCommand.ts`|`defineCommand` — single-purpose operation|
|`*Service.ts`|`ProductService.ts`|`defineService` — multi-method service or store|
|`*Factory.ts`|`ProductClientFactory.ts`|`defineFactory`|
|`*.contract.ts`|`ProductCreateCommand.contract.ts`|the unit's published params, result and `Shape`|
|`*Endpoint.ts`|`ProductCreateEndpoint.ts`|`defineEndpoint` from `@nzyme/rpc` — the API definition|
|`*EndpointHandler.ts`|`ProductCreateEndpointHandler.ts`|`defineEndpointHandler` from `@nzyme/rpc`|
|`*Types.ts`|`ProductTypes.ts`|types shared by 2+ modules, or a set of small related types|
|`*.test.ts`|`ProductService.test.ts`|colocated test|

## Core patterns

### Command — `setup` returns the function itself

```ts
import { defineCommand } from '@nzyme/ioc/Command.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { ProductApiClient } from './ProductApiClient.js';
import type { ProductCreateCommandShape } from './ProductCreateCommand.contract.js';

export const ProductCreateCommand = defineCommand({
    name: 'ProductCreateCommand',
    deps: { api: ProductApiClient, logger: Logger },
    setup({ api, logger }): ProductCreateCommandShape {
        return async params => {
            const { id } = await api.createProduct(params);
            logger.info('Product created', { productId: id });
            return { productId: id };
        };
    },
});
```

### Service — methods share one closure

Return the public surface first; helpers follow as hoisted function declarations.

```ts
import { defineService } from '@nzyme/ioc/Service.js';

export const SessionContext = defineService({
    name: 'SessionContext',
    deps: { storage: SessionStorage },
    setup({ storage }): SessionContextShape {
        return { get, assert };

        function get() {
            return storage.read();
        }

        function assert() {
            const session = get();
            if (!session) {
                throw new HttpError(401, 'Unauthorized'); // HttpError from @nzyme/fetch-utils
            }
            return session;
        }
    },
});
```

### Factory — deps once, instance per call

```ts
import { defineFactory } from '@nzyme/ioc/Factory.js';

export const ProductClientFactory = defineFactory({
    name: 'ProductClientFactory',
    deps: { logger: Logger },
    setup({ logger }, baseUrl: string) {
        return createProductClient({ baseUrl, logger });
    },
});
// container.resolve(ProductClientFactory)('https://eu.example.com')
```

### Contract split — the `: Shape` annotation is mandatory

A command or service others depend on publishes its shape in a colocated `.contract.ts` (params,
result, `Shape` interface), separate from the implementation:

```ts
// ProductCreateCommand.contract.ts
export interface ProductCreateCommandParams {
    name: string;
    priceCents: number;
}

export interface ProductCreateCommandResult {
    productId: string;
}

/** Creates a product in the catalog. */
export interface ProductCreateCommandShape {
    (params: ProductCreateCommandParams): Promise<ProductCreateCommandResult>;
}
```

The implementation's `setup()` **must** carry the explicit `: [Name]Shape` return annotation. Without
it the unit's type is inferred from whatever `setup` happens to return, so drift — a wrong param type,
a missing field, a forgotten `await` — type-checks green and explodes at a distant call site or at
runtime. The annotation checks the implementation against the published contract at the definition.
Factories, external-client wrappers and reactive stores have no contract; their inferred return is
fine.

- Keep a command's params type in its own `.contract.ts` as `[Command]Params` — don't promote it to a
  shared package unless unrelated domains genuinely share it.
- Params that cross a trust boundary (endpoint payloads) are a runtime schema parsed at the top of the
  command; a plain interface is enough for internal callers.
- For non-trivial results, a named `…Result` interface with JSDoc — never an inline object type.
- Expected failures the caller must branch on are part of the contract (a discriminated result the
  caller checks before reading the value); `throw` is for invariant violations. Use one shape across a
  domain's commands so every caller reads failures the same way.

### Dependencies — declare, never import-and-use

Everything a unit needs goes in `deps`: services, commands, interfaces, env variables. Importing a
service value and using it inside `setup` bypasses the container — it can't be overridden in tests.

```ts
// Good
deps: { logger: Logger, apiKey: CATALOG_API_KEY },
setup({ logger, apiKey }) { /* use injected */ }
```

Resolve a unit outside another unit with `container.resolve(Unit)`; in Vue components and composables
with `useService(Unit)` from `@nzyme/vue-ioc/useService.js`. The resolved type of a unit is
`Resolved<typeof Unit>` (`@nzyme/ioc/Injectable.js`).

### Interfaces — abstract dependencies the app provides

`defineInterface<T>({ name, default? })` (`@nzyme/ioc/Interface.js`) declares a dependency with no
implementation; the app registers one with `container.set(Interface, value)`, or with
`container.register(Service)` for a service declaring `implements: Interface` — `implements` alone binds
nothing until that service is first resolved. Resolution walks up parent containers, falls back to
`default`, and throws when neither exists. `Interface.optional()` resolves to `undefined` instead of
throwing; `Interface.default(value)` supplies a per-dependency fallback — both look only in the current
container, not its parents. Framework interfaces an app typically provides: `LanguageContext`
(`@nzyme/i18n`), `LoggerTransport` (`@nzyme/logging`, defaults to the console), `EnvVariables`
(defaults to `process.env`).

### Environment variables

`defineEnvVariable` from `@nzyme/ioc/defineEnvVariable.js`; never `process.env`. **A bare call is
required** — `defineEnvVariable('X')` resolves to `string` and throws at resolution if unset.

```ts
export const CATALOG_API_KEY = defineEnvVariable('CATALOG_API_KEY');
export const CATALOG_API_URL = defineEnvVariable('CATALOG_API_URL', { default: 'https://api.example.com' });
```

Read `references/env-variables.md` for `parse`, `required: false`, the type each option really
produces (`required: false` does **not** add `| undefined`) and per-package `env.ts` files.

### Reactive frontend stores

A store shared across components is a `defineService` whose `setup` holds refs and exposes them through
`reactive()`. Read `references/reactive-services.md` when building one, a service with events
(`createEventEmitter`) or a deduplicated background task (`createSingleRunner`).

### Overriding and mocking

`container.set(Unit, replacement)` overrides a unit — an object for a service, a function for a command
— and must run **before** anything that depends on it is resolved, since a singleton resolves its deps
once:

```ts
import { mock } from 'bun:test';

import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

const { container, logs } = createTestContainer(); // logs: every entry the code under test logged
container.set(ProductApiClient, { createProduct: mock(async () => ({ id: 'p1' })) });
container.set(EnvVariables, { CATALOG_API_KEY: 'test-key' }); // instead of mutating process.env

const createProduct = container.resolve(ProductCreateCommand);
```

What `set` reaches: singleton services, commands, factories and interfaces. It does **not** reach
transient services (`Logger` is one — override `LoggerTransport`, which `createTestContainer` already
does) or plain injectables from `defineInjectable` — `Fetch`, `constValue`, env variables — whose
`resolve` ignores the container; override their source (`EnvVariables`) or put an interface in front.

Without a container, `Unit.create(deps)` (or `Unit.create()` when there are no deps) runs `setup`
directly. Test structure and assertions: testing skill.

## Anti-patterns

- **Wrapping a stateless helper in `defineCommand`** — container dead weight, a noisier call site, and
  a mock nobody needs.
- **`setup()` without the `: Shape` annotation** where a contract exists — a contract mismatch compiles
  clean and surfaces far away.
- **`process.env.X` or importing a service value inside `setup`** — no typing or required-check, no
  test override, resolution at import time.
- **A `defineService` with exactly one stateless method** — a command wearing a service's clothes. Use
  `defineCommand`, whose `setup` returns the callable (`generate(opts)`, not `generator.generate(opts)`),
  and name its signature in the `.contract.ts`.
- **Making callers pre-format nullable inputs** (`firstName ?? ''` at every call site) — accept the raw
  `string | null` and handle it once inside the command.
- **Leaking an external SDK's raw types into params or the Shape** — define the params you need and
  build the SDK payload inside.
- **`container.set` after resolving the unit under test** — the singleton already holds the real
  dependency; the override is silently ignored.

## References

- `references/env-variables.md` — `parse`, optionality and the types each option yields, `env.ts`
  layout, bad patterns.
- `references/reactive-services.md` — shared reactive stores, event-emitting services,
  `createSingleRunner` background tasks.
