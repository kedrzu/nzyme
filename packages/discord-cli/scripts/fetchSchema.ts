/**
 * Downloads the official Discord OpenAPI spec at a pinned commit of `discord/discord-api-spec` and writes
 * it to this package's `openapi.json`, the single copy `discord schema` browses offline. Bump `SPEC_SHA`
 * to refresh it, then run `bun run schema`, which also formats the file.
 *
 * No credential is sent: the spec is a public file on raw.githubusercontent.com.
 *
 * Run with: `bun run schema`
 */
import { writeFile } from 'node:fs/promises';

const SPEC_SHA = '3a21a01249a763cd47f1dfec3da91c5ba71bb974';
const SPEC_URL = `https://raw.githubusercontent.com/discord/discord-api-spec/${SPEC_SHA}/specs/openapi.json`;
const OUTPUT_PATH = new URL('../openapi.json', import.meta.url);

const response = await fetch(SPEC_URL);

if (!response.ok) {
    throw new Error(`Spec fetch failed: ${response.status} ${response.statusText}`);
}

const document: unknown = await response.json();

if (
    typeof document !== 'object' ||
    document === null ||
    !('openapi' in document) ||
    !('paths' in document) ||
    typeof document.paths !== 'object' ||
    document.paths === null
) {
    throw new Error(`${SPEC_URL} is not an OpenAPI document with paths`);
}

await writeFile(OUTPUT_PATH, JSON.stringify(document));

console.log(`Spec written to ${OUTPUT_PATH.pathname}`);
