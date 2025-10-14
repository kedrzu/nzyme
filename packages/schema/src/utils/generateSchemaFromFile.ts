import { parseTypeFile } from '../ast/parseTypeFile.js';
import { generateSchemaFile, getSchemaOutputPath } from '../output/generateSchemaFile.js';
import { transformAstToSchema } from '../transform/astToSchema.js';
import type { SchemaDefinition } from '../transform/astToSchema.js';

/**
 * Options for generating schemas from TypeScript files
 */
export interface GenerateSchemaFromFileOptions {
    /** Path to the input .type.ts file */
    inputPath: string;
    /** Optional output directory (defaults to same directory as input) */
    outputDir?: string;
    /** Custom output path (overrides outputDir) */
    outputPath?: string;
    /** Custom header comment to add to the generated file */
    headerComment?: string;
    /** Whether to include sury import (default: true) */
    includeSuryImport?: boolean;
}

/**
 * Result of generating schemas from a TypeScript file
 */
export interface GenerateSchemaResult {
    /** Path to the generated schema file */
    outputPath: string;
    /** Generated schema definitions */
    schemas: SchemaDefinition[];
    /** Number of schemas generated */
    count: number;
}

/**
 * Generate sury schemas from a TypeScript .type.ts file
 * @param options Generation options
 * @returns Result with generated schemas and output path
 */
export async function generateSchemaFromFile(options: GenerateSchemaFromFileOptions): Promise<GenerateSchemaResult> {
    const { inputPath, outputDir, outputPath, headerComment, includeSuryImport } = options;

    // Step 1: Parse the TypeScript file into AST
    const parseResult = await parseTypeFile(inputPath);

    // Step 2: Transform AST nodes to schema definitions
    const schemas = parseResult.definitions.map(def => transformAstToSchema(def.node, def.jsDoc));

    // Step 3: Determine output path
    const finalOutputPath = outputPath || getSchemaOutputPath(inputPath, outputDir);

    // Step 4: Generate the schema file
    await generateSchemaFile({
        inputPath,
        outputPath: finalOutputPath,
        schemas,
        includeSuryImport,
        headerComment,
    });

    return {
        outputPath: finalOutputPath,
        schemas,
        count: schemas.length,
    };
}

/**
 * Generate schemas from multiple TypeScript files
 * @param filePaths Array of input file paths
 * @param options Common options for all files
 * @returns Array of generation results
 */
export async function generateSchemasFromFiles(
    filePaths: string[],
    options: Omit<GenerateSchemaFromFileOptions, 'inputPath'> = {},
): Promise<GenerateSchemaResult[]> {
    const results: GenerateSchemaResult[] = [];

    for (const filePath of filePaths) {
        const result = await generateSchemaFromFile({
            ...options,
            inputPath: filePath,
        });
        results.push(result);
    }

    return results;
}
