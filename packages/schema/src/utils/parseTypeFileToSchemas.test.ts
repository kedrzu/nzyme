import { mkdir, readdir, rm } from 'fs/promises';
import { basename, join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { parseTypeFileToSchemas } from './parseTypeFileToSchemas.js';

const TEST_DIR = join(process.cwd(), 'test-temp-parse');
const TESTS_FIXTURES_DIR = join(process.cwd(), 'tests');

/**
 * Get all test case names from the tests directory
 */
async function getTestCases(): Promise<string[]> {
    const files = await readdir(TESTS_FIXTURES_DIR);
    const typeFiles = files.filter(file => file.endsWith('.type.ts'));

    return typeFiles.map(file => basename(file, '.type.ts'));
}

describe.skip('parseTypeFileToSchemas', () => {
    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should parse schemas without generating files for all test cases', async () => {
        const testCases = await getTestCases();

        expect(testCases.length).toBeGreaterThan(0);

        for (const testCase of testCases) {
            const typeFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.type.ts`);

            const schemas = await parseTypeFileToSchemas(typeFilePath);

            expect(schemas.length).toBeGreaterThan(0);
            expect(schemas[0]!.name).toBeDefined();
            expect(schemas[0]!.schema).toBeDefined();
        }
    });
});
