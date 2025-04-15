import { expect, test } from 'vitest';

import { compileTranslations } from './compileTranslations.js';
import { toYaml } from './toYaml.js';
import type { TranslationDocument } from './types.js';

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
