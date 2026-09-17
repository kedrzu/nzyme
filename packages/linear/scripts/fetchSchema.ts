/**
 * Downloads the Linear GraphQL schema (introspection) and writes it as SDL to this package's
 * `schema.graphql`. That file is the single copy of the schema for the whole repo — consumers
 * point their codegen at it rather than each fetching and committing their own ~57k lines. Refresh
 * it with this script, then regenerate the consumers' SDKs (e.g. `bun run codegen` in
 * `packages/bmo`).
 *
 * No credential is sent: Linear answers a full introspection query
 * unauthenticated, so refreshing the schema never needs a developer token.
 *
 * Run with: `bun run schema`
 */
import { writeFile } from 'node:fs/promises';

import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';
import type { IntrospectionQuery } from 'graphql';

const SCHEMA_URL = 'https://api.linear.app/graphql';
const OUTPUT_PATH = new URL('../schema.graphql', import.meta.url);

const response = await fetch(SCHEMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
});

if (!response.ok) {
    throw new Error(`Schema fetch failed: ${response.status} ${response.statusText}`);
}

const payload = (await response.json()) as { data: IntrospectionQuery };
const sdl = printSchema(buildClientSchema(payload.data));

await writeFile(OUTPUT_PATH, sdl + '\n');

console.log(`Schema written to ${OUTPUT_PATH.pathname}`);
