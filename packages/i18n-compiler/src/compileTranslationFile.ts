import { readFile } from 'fs/promises';

import { saveFile } from '@nzyme/project-utils';

import { compileTranslations } from './compileTranslations.js';
import type { TranslationResult } from './compileTranslations.js';

/**
 * Result of translation file compilation
 */
export interface CompileTranslationFileResult {
    /**
     * Compilation errors found
     */
    errors: TranslationResult['errors'];
    /**
     * Path where the output was saved
     */
    outputPath: string;
    /**
     * Whether compilation was successful (no errors)
     */
    success: boolean;
}

/**
 * Compile a translation YAML file to TypeScript with formatting and ESLint fixes
 * @__NO_SIDE_EFFECTS__
 */
export async function compileTranslationFile(
    inputPath: string,
    outputPath: string,
): Promise<CompileTranslationFileResult> {
    // Read the input YAML file
    const yamlContent = await readFile(inputPath, 'utf-8');

    // Compile the translations
    const result = compileTranslations(yamlContent);

    // Save the compiled code with formatting and ESLint fixes
    await saveFile(outputPath, result.code);

    return {
        errors: result.errors,
        success: result.errors.length === 0,
        outputPath,
    };
}
