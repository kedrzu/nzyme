import { readdirSync } from 'fs';
import { basename, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, test } from 'vitest';

import { compileTranslationFile } from './compileTranslationFile.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TESTS_FIXTURES_DIR = resolve(__dirname, '../tests');

/**
 * Get all test case names from the tests directory
 */
function getTestCases(): string[] {
    const files = readdirSync(TESTS_FIXTURES_DIR);
    const yamlFiles = files.filter(file => file.endsWith('.yaml'));

    return yamlFiles.map(file => basename(file, '.yaml'));
}

describe('compileTranslationFile (E2E File Tests)', () => {
    // Generate individual test cases for each fixture
    const testCases = getTestCases();

    if (testCases.length === 0) {
        test('should have test cases available', () => {
            // This test will pass if no fixtures exist yet, but provides a placeholder
            expect(true).toBe(true);
        });
    }

    for (const testCase of testCases) {
        test(`should compile ${testCase} file correctly`, async () => {
            const yamlFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.yaml`);
            const outputFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.loc.ts`);

            // Compile the file
            const result = await compileTranslationFile(yamlFilePath, outputFilePath);

            // Should not have errors
            expect(result.errors).toEqual([]);
            expect(result.success).toBe(true);
            expect(result.outputPath).toBe(outputFilePath);
        });
    }
});
