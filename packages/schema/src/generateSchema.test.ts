import { readdirSync, readFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { beforeEach, describe, expect, it } from 'bun:test';

import { generateSchemaFromFile } from './generateSchema.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TEST_DIR = resolve(__dirname, '../test-temp');
const TESTS_FIXTURES_DIR = resolve(__dirname, '../tests');

/**
 * Get all test case names from the tests directory
 */
function getTestCases(): string[] {
    const files = readdirSync(TESTS_FIXTURES_DIR);
    const typeFiles = files.filter(file => file.endsWith('.type.ts'));

    return typeFiles.map(file => basename(file, '.type.ts'));
}

describe.skip('generateSchema (Dynamic E2E Tests)', () => {
    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
    });

    // Generate individual test cases for each fixture
    const testCases = getTestCases();

    if (testCases.length === 0) {
        it('should have test cases available', () => {
            expect(testCases.length).toBeGreaterThan(0);
        });
    }

    for (const testCase of testCases) {
        it(`should generate correct schema for ${testCase}`, async () => {
            const typeFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.type.ts`);
            const expectedSchemaPath = join(TESTS_FIXTURES_DIR, `${testCase}.schema.ts`);

            // Read input type file
            const typeContent = readFileSync(typeFilePath, 'utf-8');

            // Create temporary input file
            const inputPath = join(TEST_DIR, `${testCase}.type.ts`);
            await writeFile(inputPath, typeContent);

            // Generate schema
            const result = await generateSchemaFromFile({
                inputPath,
            });

            // Read expected output
            const expectedContent = readFileSync(expectedSchemaPath, 'utf-8');

            // Read generated output
            const generatedContent = await readFile(result.outputPath, 'utf-8');

            // Compare generated with expected
            expect(generatedContent).toBe(expectedContent);

            // Verify that at least one schema was generated
            expect(result.count).toBeGreaterThan(0);
            expect(result.schemas.length).toBeGreaterThan(0);
        });
    }
});
