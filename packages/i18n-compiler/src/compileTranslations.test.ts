import { readdirSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, test } from 'vitest';

import { compileTranslations } from './compileTranslations.js';
import { toYaml } from './toYaml.js';
import type { TranslationDocument } from './types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TESTS_FIXTURES_DIR = resolve(__dirname, '../tests');

test('it should compile translations', () => {
    const doc: TranslationDocument = {
        test: {
            pl: 'polish',
            en: 'english',
        },
    };

    const yaml = toYaml(doc);
    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    console.log(result.code);
});

test('it should compile translations with params', () => {
    const doc: TranslationDocument = {
        test: {
            pl: 'hello {name}!',
            en: 'helloł {name}!',
        },
    };

    const yaml = toYaml(doc);
    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    console.log(result.code);
});

test('it should compile multiple translations', () => {
    const doc: TranslationDocument = {
        test1: {
            pl: 'polish',
            en: 'english',
        },
        test2: {
            pl: 'hello {name}!',
            en: 'helloł {name}!',
        },
    };

    const yaml = toYaml(doc);
    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    console.log(result.code);
});

test('it should ignore tags in language keys', () => {
    const yaml = `loginFailed:
  pl: 'Nieprawidłowy adres e-mail lub hasło'
  en[auto]: 'Invalid email or password'`;

    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    expect(result.code).toContain("case 'en':");
    expect(result.code).toContain("'Invalid email or password'");
    expect(result.code).not.toContain("case 'en[auto]':");
});

test('it should handle multiple tags in language keys', () => {
    const yaml = `welcomeMessage:
  pl: 'Witaj {name}!'
  en[auto draft]: 'Welcome {name}!'
  de[auto]: 'Willkommen {name}!'`;

    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    expect(result.code).toContain("case 'en':");
    expect(result.code).toContain("case 'de':");
    expect(result.code).toContain("'Welcome {name}!'");
    expect(result.code).toContain("'Willkommen {name}!'");
    expect(result.code).not.toContain('[auto,draft]');
    expect(result.code).not.toContain('[auto]');
});

test('it should handle mixed tagged and untagged language keys', () => {
    const yaml = `testMessage:
  pl: 'Polish text'
  en: 'English text'
  fr[auto]: 'French text'
  de[draft auto]: 'German text'`;

    const result = compileTranslations(yaml);

    expect(result.errors).toEqual([]);
    expect(result.code).toContain("case 'pl':");
    expect(result.code).toContain("case 'en':");
    expect(result.code).toContain("case 'fr':");
    expect(result.code).toContain("case 'de':");
    expect(result.code).not.toContain('[auto]');
    expect(result.code).not.toContain('[draft');
});

/**
 * Get all test case names from the tests directory
 */
function getTestCases(): string[] {
    const files = readdirSync(TESTS_FIXTURES_DIR);
    const yamlFiles = files.filter(file => file.endsWith('.yaml'));

    return yamlFiles.map(file => basename(file, '.yaml'));
}

describe('compileTranslations (Dynamic E2E Tests)', () => {
    // Generate individual test cases for each fixture
    const testCases = getTestCases();

    if (testCases.length === 0) {
        test('should have test cases available', () => {
            // This test will pass if no fixtures exist yet, but provides a placeholder
            expect(true).toBe(true);
        });
    }

    for (const testCase of testCases) {
        test(`should compile ${testCase} correctly`, () => {
            const yamlFilePath = join(TESTS_FIXTURES_DIR, `${testCase}.yaml`);
            const expectedTsPath = join(TESTS_FIXTURES_DIR, `${testCase}.ts`);

            // Read input YAML file
            const yamlContent = readFileSync(yamlFilePath, 'utf-8');

            // Read expected TypeScript output
            const expectedContent = readFileSync(expectedTsPath, 'utf-8');

            // Compile the YAML
            const result = compileTranslations(yamlContent);

            // Should not have errors
            expect(result.errors).toEqual([]);

            // Compare generated with expected
            expect(result.code.trim()).toBe(expectedContent.trim());
        });
    }
});
