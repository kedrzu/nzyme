# GraphQL integrations

A GraphQL vendor gets the same package-per-vendor treatment as REST, with graphql-codegen in place of
`openapi-typescript`. The generated SDK exposes each hand-written operation as a typed method, and a
small requester is the only runtime code — no Apollo, urql or `graphql-request`.

## Layout

```
packages/catalog/
├── codegen.yml
├── package.json                # scripts: schema, codegen; graphql-codegen + graphql as devDependencies
├── scripts/fetchSchema.ts      # introspection → SDL, written to src/schema.graphql
└── src/
    ├── schema.graphql          # committed SDL — the input to codegen
    ├── operations/             # one hand-written operation per .gql file
    │   ├── ProductGet.gql
    │   └── ProductList.gql
    ├── sdk.gen.ts              # committed generated SDK
    ├── catalogEnv.ts           # CATALOG_API_KEY, CATALOG_BASE_URL (default: production)
    ├── createCatalogRequester.ts
    ├── createCatalogRequester.test.ts
    ├── CatalogClient.ts
    ├── CatalogRequestError.ts  # HTTP failure
    └── CatalogGraphQLError.ts  # 2xx with a non-empty errors[]
```

Only the operations the repo uses exist in `operations/`; the generated types cover exactly those
selections, so the SDK stays small however large the vendor's schema is.

## Scripts and codegen

```json
"scripts": {
    "schema": "bun run scripts/fetchSchema.ts",
    "codegen": "graphql-codegen --config codegen.yml"
}
```

Same split as REST: `schema` reaches the network, `codegen` works offline from the committed SDL.
Both are uncached Nx targets.

```yaml
schema: 'src/schema.graphql'
documents: 'src/operations/**/*.gql'
generates:
  src/sdk.gen.ts:
    plugins:
      - add:
          content: |-
            // @ts-nocheck
            // GENERATED FILE — do not edit. See codegen.yml.

            class TypedDocumentString<TResult, TVariables> extends String {
                __apiType?: (variables: TVariables) => TResult;
            }
      - typescript
      - typescript-operations
      - typescript-generic-sdk
    config:
      documentMode: 'string'
      scalars:
        ID: string
hooks:
  afterOneFileWrite:
    - oxfmt
```

- `documentMode: 'string'` emits each operation as a string subclass, so the requester sends
  `String(doc)` and nothing parses GraphQL at run time. The `add` block declares the
  `TypedDocumentString` class that mode references.
- Map custom scalars (`ID`, dates, JSON) under `scalars` to what the wire carries, not to what you
  would like it to be: a `DateTime` scalar arrives as a `string`.

`scripts/fetchSchema.ts` posts `getIntrospectionQuery()` to the vendor, then writes
`printSchema(buildClientSchema(data))` to `src/schema.graphql`. Point it at the vendor's sandbox or
staging endpoint when production introspection is disabled or gated.

## The requester

`typescript-generic-sdk`'s `getSdk(requester)` calls `requester(doc, variables)` for every operation.
The requester owns transport, auth headers and error translation:

```ts
export interface CreateCatalogRequesterOptions {
    apiKey: string;
    baseUrl: string;
    /** Defaults to `globalThis.fetch`; tests pass a fake. */
    fetch?: Fetch;
}

export function createCatalogRequester(options: CreateCatalogRequesterOptions) {
    const { apiKey, baseUrl, fetch = globalThis.fetch } = options;

    return async function request<R, V>(doc: unknown, variables?: V): Promise<R> {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ query: String(doc), variables: variables ?? {} }),
        });

        if (!response.ok) {
            throw new CatalogRequestError(response.status, response.statusText);
        }

        const payload = (await response.json()) as CatalogResponse<R>;
        if (payload.errors && payload.errors.length > 0) {
            throw new CatalogGraphQLError(payload.errors);
        }

        return payload.data as R;
    };
}
```

**Two error classes, because GraphQL fails two ways:** a non-2xx response (auth, rate limit, outage)
and a 2xx response whose `errors` array is non-empty (validation, a resolver failure). Callers and
alerting treat them differently. A GraphQL error's `message` often echoes the rejected input, so
`CatalogGraphQLError` builds its own message from the failing field `path`s and the count, and keeps
the raw entries on an `errors` property — never in the message (`nzyme:logging`).

Unit-test the requester with a fake `fetch` passed through the options: headers and body sent, data
returned, each error class thrown. That test plus the generated types cover the integration's own
code.

## The client service

```ts
export const CatalogClient = defineService({
    name: 'CatalogClient',
    deps: { apiKey: CATALOG_API_KEY, baseUrl: CATALOG_BASE_URL },
    setup({ apiKey, baseUrl }) {
        return getSdk(createCatalogRequester({ apiKey, baseUrl }));
    },
});

// const catalog = container.resolve(CatalogClient);
// const { product } = await catalog.ProductGet({ id });
```

The SDK already is one typed method per operation, so a bare SDK call needs no wrapping command. Add a
`<Vendor><Subject><Verb>Command` when an operation carries logic — mapping the vendor's shape to the
repo's, turning a `null` or a domain error into a result, several calls in sequence — and mock that
command in the tests of code that uses it. Tests of code calling the SDK directly override
`CatalogClient` with `container.set` and a fake exposing the methods used.
