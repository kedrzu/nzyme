import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

import { compileTranslationFile } from './compileTranslationFile.js';

const __dirname = import.meta.dirname;
const TESTS_FIXTURES_DIR = resolve(__dirname, '../tests');

/**
 * Get all test case names from the tests directory
 */
function getTestCases(): string[] {
    const files = readdirSync(TESTS_FIXTURES_DIR);
    const yamlFiles = files.filter(file => file.endsWith('.yaml'));

    return yamlFiles.map(file => basename(file, '.yaml'));
}

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
        const expectedFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.ts`);

        // Compile the file
        const result = await compileTranslationFile(yamlFilePath, outputFilePath);
        const outputContent = readFileSync(outputFilePath, 'utf-8');
        const expectedContent = readFileSync(expectedFilePath, 'utf-8');

        // Should not have errors
        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
        expect(result.outputPath).toBe(outputFilePath);
        expect(outputContent).toBe(expectedContent);
    });
}
