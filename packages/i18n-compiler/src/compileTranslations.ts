import type { Pair, ParsedNode, Range } from 'yaml';
import { isMap, isScalar, parseDocument } from 'yaml';

import type { TranslationError } from './types.js';

const KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]+$/;
const SLOT_REGEX = /\{\s*(\w*)\s*\}/gm;
const INDENT = '  ';

/**
 *
 */
export type TranslationResult = {
    /**
     *
     */
    code: string;
    /**
     *
     */
    errors: TranslationError[];
    /**
     *
     */
    yaml: string;
};

/**
 *
 */
export function compileTranslations(yaml: string): TranslationResult {
    const document = parseDocument(yaml);
    const root = document.contents;

    const result: TranslationResult = {
        errors: [],
        code: '',
        yaml,
    };

    if (!root) {
        return createEmptyResult(yaml);
    }

    if (!isMap(root)) {
        result.errors.push({
            message: 'Document must be an object',
            ...rangeToLineColumn(document.range, result),
        });

        return result;
    }

    if (root.items.length === 0) {
        return createEmptyResult(yaml);
    }

    for (const item of root.items) {
        compileSingleTranslation(item, result);
    }

    if (result.code) {
        result.code = `import type { Translation } from '@nzyme/i18n';\n\n${result.code}\n`;
    }

    return result;
}

function createEmptyResult(yaml: string): TranslationResult {
    return {
        code: `export {};\n`,
        errors: [],
        yaml,
    };
}

function compileSingleTranslation(item: Pair<ParsedNode, ParsedNode | null>, result: TranslationResult) {
    const key = item.key.toString();

    if (!KEY_REGEX.test(key)) {
        result.errors.push({
            key,
            message: 'Translation key must be a valid identifier',
            ...rangeToLineColumn(item.key.range, result),
        });

        return;
    }

    if (!isMap(item.value)) {
        result.errors.push({
            key,
            message: 'Translation must be an object with language keys',
            ...rangeToLineColumn(item.key.range, result),
        });

        return;
    }

    let code = '';
    const params = new Set<string>();

    for (const lang of item.value.items) {
        const langKey = lang.key.toString();
        if (!lang.value) {
            continue;
        }

        const parsed = parseTranslationValue(key, langKey, lang.value, result);
        if (!parsed) {
            continue;
        }

        code += `${INDENT}${INDENT}case '${langKey}':\n${INDENT}${INDENT}${INDENT}return ${parsed.translation};\n`;
        for (const param of parsed.params) {
            params.add(param);
        }
    }

    const paramsType = Array.from(params)
        .map(p => `${p}: unknown`)
        .join(', ');
    const type = paramsType ? `Translation<{ ${paramsType} }>` : 'Translation';
    const paramsSuffix = params.size ? `, params` : '';

    // end of function
    code = `export const ${key}: ${type} = (lang${paramsSuffix}) => {\n${INDENT}switch (lang) {\n${code}${INDENT}}\n};`;

    if (result.code) {
        result.code += '\n\n';
    }

    result.code += code;
}

function parseTranslationValue(key: string, lang: string, item: ParsedNode, result: TranslationResult) {
    if (!isScalar(item)) {
        result.errors.push({
            key,
            lang,
            message: 'Translation value must be a string',
            ...rangeToLineColumn(item.range, result),
        });

        return null;
    }

    const value = item.toString().trim();
    const params: string[] = [];
    const translation: string[] = [];

    let index = 0;
    let match: RegExpExecArray | null;

    while ((match = SLOT_REGEX.exec(value))) {
        if (match.index && match.index > index) {
            // handle a piece of text
            const text = value.substring(index, match.index);
            translation.push(JSON.stringify(text));
            index = match.index;
        }

        index += match[0].length;

        const slot = match[1]!;
        translation.push(`params.${slot}`);
        params.push(slot);
    }

    // Add the rest of the text
    if (index < value.length) {
        const text = value.substring(index);
        translation.push(JSON.stringify(text));
    }

    return {
        translation: translation.length === 1 ? translation[0] : `[${translation.join(', ')}]`,
        params: params,
    };
}

function rangeToLineColumn(range: Range, result: TranslationResult) {
    const startChar = range[0];

    const before = result.yaml.slice(0, startChar);
    const line = before.split('\n').length;
    const column = startChar - before.lastIndexOf('\n') - 1;

    return {
        line,
        column,
    };
}
