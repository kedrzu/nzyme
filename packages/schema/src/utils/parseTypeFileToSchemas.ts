import { parseTypeFile } from '../ast/parseTypeFile.js';
import { transformAstToSchema } from '../transform/astToSchema.js';
import type { SchemaDefinition } from '../transform/astToSchema.js';

/**
 * Parse a TypeScript type file and return schema definitions without generating files
 * @param inputPath Path to the .type.ts file
 * @returns Array of schema definitions
 */
export async function parseTypeFileToSchemas(inputPath: string): Promise<SchemaDefinition[]> {
    const parseResult = await parseTypeFile(inputPath);
    return parseResult.definitions.map(def => transformAstToSchema(def.node, def.jsDoc));
}
