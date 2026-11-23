/**
 * Downloads the community-maintained Spotify Web API OpenAPI spec at a pinned commit of
 * `sonallux/spotify-web-api` (tag v2026.5.31), converts it from YAML and writes it to this package's
 * `openapi.json`, the single copy `codegen` reads and `spotify schema` browses offline. Bump `SPEC_SHA`
 * to refresh it, then run `bun run schema`, which also formats the file.
 *
 * No credential is sent: the spec is a public file on raw.githubusercontent.com.
 *
 * Run with: `bun run schema`
 */
import { writeFile } from 'node:fs/promises';

const SPEC_SHA = '39207c4ba600deb34b0913975d01983ba60be583';
const SPEC_URL = `https://raw.githubusercontent.com/sonallux/spotify-web-api/${SPEC_SHA}/fixed-spotify-open-api.yml`;
const OUTPUT_PATH = new URL('../openapi.json', import.meta.url);

const response = await fetch(SPEC_URL);

if (!response.ok) {
    throw new Error(`Spec fetch failed: ${response.status} ${response.statusText}`);
}

const document: unknown = Bun.YAML.parse(await response.text());

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
