import { getSchemaOutputPath } from '../output/generateSchemaFile.js';

/**
 * Get the corresponding schema file path for a type file
 * @param typeFilePath Path to a .type.ts file
 * @param outputDir Optional output directory
 * @returns Path to the corresponding .schema.ts file
 * @__NO_SIDE_EFFECTS__
 */
export function getSchemaFilePath(typeFilePath: string, outputDir?: string): string {
    return getSchemaOutputPath(typeFilePath, outputDir);
}
