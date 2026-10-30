---
name: api-clients
description: >-
    Third-party API integrations on @nzyme — one package per vendor; REST from a committed OpenAPI
    spec through openapi-typescript and @nzyme/openapi, as a client service plus one command per
    operation; GraphQL from a committed SDL and `.gql` operations through graphql-codegen's generic
    SDK with a thin requester and no runtime GraphQL library; @nzyme/fetch-utils endpoints when the
    vendor publishes no spec. Covers where specs and generated files live, the `schema` and `codegen`
    scripts as Nx targets, auth and base URLs from env variables, error handling over typed status
    unions, and mocking at the client boundary. Use when adding or changing an integration with an
    external HTTP or GraphQL API. Not for: the @nzyme/openapi call API (its README), DI mechanics (ioc
    skill), test wiring (testing skill).
disable-model-invocation: true
---

# API clients

An integration with an external API is a package that turns the vendor's contract into typed
operations the rest of the repo resolves from the container. Types come from the vendor's own
contract wherever one exists: a spec change then surfaces as a compile error, not as a runtime
surprise in production.

## When NOT to use

- **How to call `createOpenApiFetch` / `openApiFetch`** — request options, content types, the
  response union, file uploads: the `@nzyme/openapi` README (`node_modules/@nzyme/openapi/README.md`).
  This skill is the practice around it.
- **`defineService`, `defineCommand`, `Shape`, `defineEnvVariable`, `container.set`** → `nzyme:ioc`.
- **Test structure and the mocking policy** → `nzyme:testing`. Logging a failed call → `nzyme:logging`.
- **Your own backend's endpoints** — those are `@nzyme/rpc`, not a third-party client.

## Pick the shape by what the vendor publishes

|Vendor publishes|Shape|Runtime dependency|
|-|-|-|
|OpenAPI spec (JSON/YAML)|`openapi-typescript` → `schema.gen.d.ts` → `createOpenApiFetch<paths>` in a client service, one command per operation|`@nzyme/openapi`|
|GraphQL schema (SDL or introspection)|`.gql` operations → graphql-codegen `typescript-generic-sdk` → `getSdk(requester)` in a client service — `references/graphql.md`|none (a ~40-line requester)|
|Neither (REST without a spec, XML, form-encoded)|hand-modelled `defineEndpoint`s run by a `defineFetchClient` in a client service|`@nzyme/fetch-utils`|
|A key-less public API useful to several repos|plain `defineEndpoint`s contributed to `@nzyme/apis`, no IoC|`@nzyme/fetch-utils`|

An official vendor SDK earns its place only for what is costly to rebuild (webhook signature checks,
request signing, streaming); wrap it in the same client service + commands. A spec beats a
hand-modelled endpoint even when the spec is imperfect: patch its bugs at the call site (below), do
not drop to hand-written types.

## Package layout

One package per vendor (`packages/<vendor>`), depending only on `@nzyme/*`. Nothing outside it
imports the generated file or the vendor's raw types; callers see commands and their own params and
result types.

```
packages/crm/
├── package.json              # scripts: schema (network), codegen (offline)
└── src/
    ├── openapi.json          # committed vendor spec — the input to codegen
    ├── schema.gen.d.ts       # committed generated types (pure types, no runtime)
    ├── crmEnv.ts             # CRM_API_KEY, CRM_BASE_URL (default: production)
    ├── CrmClient.ts          # defineService → createOpenApiFetch<paths>
    ├── CrmError.ts           # vendor error class, when ApplicationError is not enough
    ├── CrmContactCreateCommand.ts
    └── CrmContactGetCommand.ts
```

The `.gen` infix is load-bearing: the lint config ignores `**/*.gen.ts` and `**/*.gen.d.ts`, so
generated output never collects findings, and a reader knows not to edit it. Never hand-edit a
generated file — the next codegen run silently reverts it.

## Spec and codegen: two scripts, two Nx targets

```json
"scripts": {
    "schema": "curl -fsS https://api.crm.example/openapi.json -o src/openapi.json",
    "codegen": "openapi-typescript src/openapi.json -o src/schema.gen.d.ts && oxfmt src/schema.gen.d.ts"
}
```

- **`schema`** touches the network: it refreshes the committed spec (or SDL) from the vendor. Run it
  deliberately, when adopting a vendor change; the diff of the spec is the review of what changed.
  Prefer the vendor's sandbox or staging spec URL when production's lags or is gated.
- **`codegen`** is offline and deterministic: committed spec in, committed `*.gen.*` out, formatted by
  the repo's formatter in the same script so `format:check` stays green. Setup and CI can run it
  without credentials or vendor uptime.
- Both become Nx targets by inference from `package.json` scripts. Declare them uncached in
  `nx.json` `targetDefaults` (`"codegen": { "cache": false }`, `"schema": { "cache": false }`) —
  their output is committed source, so a cache replay buys nothing and would hide an input the
  target forgot to declare. The root script runs every package's generator at once
  (`"codegen": "nx run-many -t codegen"`), and setup calls it.
- `openapi-typescript` (and the graphql-codegen packages) are `devDependencies` of the vendor
  package; nothing generated imports them at run time.

## The client and one command per operation

`CrmClient` is a `defineService` returning `createOpenApiFetch<paths>(…)` with the base URL and auth
headers from env variables — the README's "As an IoC service" section has the exact shape. It holds
no operation logic.

Each vendor operation the repo uses is a `defineCommand` (`<Vendor><Subject><Verb>Command`, the ioc
naming) that owns everything about that call:

- **Params and result in the repo's terms** — declared at the top with the `Shape`; the vendor's
  field names and nesting are mapped inside, so a vendor rename touches one file.
- **Exhaustive handling of the typed response union** — `switch (result.status)` (and
  `contentType` where the spec lists several): expected outcomes become results (`404` → `null`,
  `409` → a domain result), everything else throws.
- **The fixed request details** — `method`, `path`, `contentType`, per-call auth headers.

Why commands rather than calling `CrmClient` from business code: the raw call is verbose and
stringly (path, method, content type), each caller would re-implement the status handling, and the
mock surface for consumers' tests becomes one small function per operation.

## Auth, base URLs and environments

- **Static API key** — a `defineEnvVariable` in `<vendor>Env.ts`, sent as a default header by the
  client service.
- **OAuth client credentials** — a `<Vendor>AuthProvider` service fetches the token, caches it until
  shortly before expiry, and returns headers; commands send `headers: await auth.getHeaders()`.
- **Base URL** — an env variable defaulting to production; sandbox and staging are an env override,
  never a code branch.

## Errors

- **Expected vendor outcomes are return values**, decided in the command, not exceptions caught by
  the caller.
- **Unexpected status** → throw `ApplicationError` (or a `<Vendor>Error` subclass when callers need
  to distinguish it) carrying `operation` and `status` as data. The message is built from the
  operation and status, never from the response body: vendor bodies echo submitted values, and an
  error message becomes an issue title and grouping key (`nzyme:logging`).
- **A wrong spec** (a misspelled enum, a missing nullable) — patch it at the call site with the
  narrowest cast and a comment naming the spec bug; report it upstream. Never edit `schema.gen.d.ts`.

## Testing at the boundary

The client service is the outside world. Per `nzyme:testing`, mock only there:

- **A command's own logic** (mapping, status handling) — `container.set(CrmClient, fake)` where the
  fake returns the typed `{ status, contentType, data, response }` for the case under test.
- **Code that uses the integration** — `container.set(CrmContactCreateCommand, mock(…))`; the
  vendor's types never leak into its tests.
- **A hand-written transport** (the GraphQL requester, a signing wrapper) — a unit test passing a fake
  `fetch` as a plain parameter. Do not override the `Fetch` injectable through `container.set`: `set`
  does not reach plain injectables (`nzyme:ioc`).
- **Never call the real vendor from the test suite** — it makes the suite depend on credentials,
  network and the vendor's rate limits.

## Anti-patterns

|Bad shape|Concrete failure|
|-|-|
|Hand-written response types when a spec exists|drift from the vendor goes unnoticed until production|
|`codegen` pointing at the vendor URL|setup and CI depend on the network; a vendor change lands unreviewed|
|Editing a `*.gen.*` file|reverted silently by the next codegen run|
|Business code calling `CrmClient({ method, path, … })`|status handling duplicated and inconsistent; a large mock surface|
|`if (result.status !== 200) throw` with no case for documented statuses|a documented `404` or `409` becomes an incident|
|Response body in the error message|submitted values in issue titles; broken error grouping|
|Base URL chosen by an `if (production)` in code|a sandbox run needs a code change|
|A runtime GraphQL client library for a server-to-server integration|a dependency doing what a 40-line requester does|

## References

- `references/graphql.md` — read when integrating a GraphQL API: package layout, `codegen.yml`, the
  schema fetch script, the requester, the client service and its two error classes.
