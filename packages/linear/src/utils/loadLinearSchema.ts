import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildSchema } from 'graphql';
import type { GraphQLSchema } from 'graphql';

let schema: GraphQLSchema | undefined;

/**
 * Loads Linear's committed GraphQL schema (`@nzyme/linear`'s `schema.graphql`) without any network
 * call, built once per process. Validation is skipped: the SDL is a committed vendor export and
 * validating the 1.36 MB document costs far more than building it.
 */
export function loadLinearSchema(): GraphQLSchema {
    if (!schema) {
        const packageJson = fileURLToPath(import.meta.resolve('@nzyme/linear/package.json'));
        const sdl = readFileSync(packageJson.replace(/package\.json$/, 'schema.graphql'), 'utf8');
        schema = buildSchema(sdl, { assumeValid: true, assumeValidSDL: true });
    }

    return schema;
}
