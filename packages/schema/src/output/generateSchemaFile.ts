import { mkdir } from 'fs/promises';
import { basename, dirname } from 'path';

import { saveFile } from '@nzyme/project-utils/saveFile.js';

import type { SchemaDefinition } from '../transform/astToSchema.js';

/**
 * Options for generating schema files
 */
export interface GenerateSchemaFileOptions {
    /** Path to the input .type.ts file */
    inputPath: string;
    /** Path where the .schema.ts file should be generated */
    outputPath: string;
    /** Array of schema definitions to include */
    schemas: SchemaDefinition[];
    /** Whether to include imports for zod */
    includeZodImport?: boolean;
    /** Custom header comment to add to the file */
    headerComment?: string;
}

/**
 * Generate a .schema.ts file from schema definitions
 * @param options Generation options
 * @__NO_SIDE_EFFECTS__
 */
export async function generateSchemaFile(options: GenerateSchemaFileOptions): Promise<void> {
    const { inputPath, outputPath, schemas, includeZodImport = true, headerComment } = options;

    const content = generateSchemaFileContent({
        inputPath,
        schemas,
        includeZodImport,
        headerComment,
    });

    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });

    // Save the generated content with prettier formatting
    await saveFile(outputPath, content);
}

/**
 * Generate the content for a schema file
 * @param options Content generation options
 * @returns Generated TypeScript content
 * @__NO_SIDE_EFFECTS__
 */
export function generateSchemaFileContent(options: {
    headerComment?: string;
    includeZodImport?: boolean;
    inputPath: string;
    schemas: SchemaDefinition[];
}): string {
    const { inputPath, schemas, includeZodImport = true, headerComment } = options;

    const lines: string[] = [];

    // Add header comment
    if (headerComment) {
        lines.push(`// ${headerComment}`);
        lines.push('');
    }

    // Add auto-generation warning
    lines.push('// This file is auto-generated. Do not edit manually.');
    lines.push('');

    // Add imports
    if (includeZodImport) {
        lines.push("import * as z from 'zod/mini';");
        lines.push('');
    }

    // Add type imports from the original file (with aliases)
    const typeNames = schemas.map(schema => schema.name);
    if (typeNames.length > 0) {
        const relativePath = getRelativeImportPath(inputPath);
        const imports = typeNames.map(name => `${name} as ${name}Type`).join(', ');
        lines.push(`import type { ${imports} } from '${relativePath}';`);
        lines.push('');
    }

    // Generate schema definitions
    for (const schema of schemas) {
        lines.push(...generateSchemaDefinitionLines(schema));
        lines.push('');
    }

    // Add type re-exports
    for (const schema of schemas) {
        lines.push(`export type ${schema.name} = ${schema.name}Type;`);
    }

    // Remove trailing empty line
    if (lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines.join('\n') + '\n';
}

/**
 * Get output file path for a given input .type.ts file
 * @param inputPath Path to the input .type.ts file
 * @param outputDir Optional output directory (defaults to same directory as input)
 * @returns Path for the corresponding .schema.ts file
 * @__NO_SIDE_EFFECTS__
 */
export function getSchemaOutputPath(inputPath: string, outputDir?: string): string {
    const base = basename(inputPath);
    const dir = outputDir || dirname(inputPath);

    // Handle case where input is just a filename (dirname returns '.')
    const isJustFilename = dir === '.' && !outputDir;

    // Convert SomeType.type.ts to SomeType.schema.ts
    if (base.endsWith('.type.ts')) {
        const nameWithoutExt = base.slice(0, -8);
        return isJustFilename ? `${nameWithoutExt}.schema.ts` : `${dir}/${nameWithoutExt}.schema.ts`;
    }

    // Fallback: convert .ts to .schema.ts
    if (base.endsWith('.ts')) {
        const nameWithoutExt = base.slice(0, -3);
        return isJustFilename ? `${nameWithoutExt}.schema.ts` : `${dir}/${nameWithoutExt}.schema.ts`;
    }

    // If no .ts extension, just append .schema.ts
    return isJustFilename ? `${base}.schema.ts` : `${dir}/${base}.schema.ts`;
}

/**
 * Generate lines for a single schema definition
 * @param schema Schema definition to generate
 * @returns Array of lines for the schema
 * @__NO_SIDE_EFFECTS__
 */
function generateSchemaDefinitionLines(schema: SchemaDefinition): string[] {
    const lines: string[] = [];

    // Add JSDoc comment only if there's content
    const hasDescription = !!schema.description;
    const hasMetaTags = schema.meta && Object.keys(schema.meta).some(key => key !== 'description');

    if (hasDescription || hasMetaTags) {
        lines.push('/**');

        if (schema.description) {
            lines.push(` * ${schema.description}`);
        }

        // Add metadata as JSDoc tags (exclude description as it's handled separately)
        if (schema.meta) {
            for (const [key, value] of Object.entries(schema.meta)) {
                if (key === 'description') {
                    continue; // Skip description tag
                }
                if (typeof value === 'string') {
                    lines.push(` * @${key} ${value}`);
                } else if (typeof value === 'boolean' && value) {
                    lines.push(` * @${key}`);
                } else {
                    lines.push(` * @${key} ${JSON.stringify(value)}`);
                }
            }
        }

        lines.push(' */');
    }

    // Add schema definition with proper type annotation
    const schemaName = schema.name;
    const typeName = `${schema.name}Type`;
    lines.push(`export const ${schemaName}: z.ZodMiniType<${typeName}> = ${schema.schema};`);

    return lines;
}

/**
 * Get relative import path for TypeScript file
 * @param inputPath Path to the original .type.ts file
 * @returns Relative import path without extension
 * @__NO_SIDE_EFFECTS__
 */
function getRelativeImportPath(inputPath: string): string {
    const base = basename(inputPath);

    // Remove .type.ts extension and add .js for proper ES module import
    if (base.endsWith('.type.ts')) {
        return `./${base.slice(0, -8)}.type.js`;
    }

    // Fallback: remove .ts and add .js
    if (base.endsWith('.ts')) {
        return `./${base.slice(0, -3)}.js`;
    }

    return `./${base}.js`;
}
