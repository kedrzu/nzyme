import type { Pair, ParsedNode, Range } from 'yaml';
import { isMap, isScalar, parseDocument } from 'yaml';

import * as pluralization from '@nzyme/i18n-core/pluralizationRules.js';
import type { Pluralization } from '@nzyme/i18n-core/pluralization.js';
import { fixOrphans } from '@nzyme/typography/fixOrphans.js';
import { capitalizeFirstLetter } from '@nzyme/utils/string/caseUtils.js';

import type { TranslationError } from './types.js';

const KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]+$/;
const SLOT_REGEX = /\{\s*(\w*)\s*\}/gm;
const ESCAPE_REGEX = /\\([{}])/gm;
const LANG_TAG_REGEX = /^([a-zA-Z_][a-zA-Z0-9_-]*)\[([^\]]+)\]$/;
const INDENT = '  ';

// JavaScript reserved words that cannot be used as variable names
const RESERVED_WORDS = new Set([
    // Keywords
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with',
    // Future reserved words
    'class', 'const', 'enum', 'export', 'extends', 'import', 'super',
    // Strict mode reserved words
    'implements', 'interface', 'let', 'package', 'private', 'protected',
    'public', 'static', 'yield',
    // Literals
    'null', 'true', 'false',
    // Additional reserved identifiers
    'await', 'async',
]);

/**
 * Result of translation compilation
 */
export type TranslationResult = {
    /**
     * Generated TypeScript code
     */
    code: string;
    /**
     * Compilation errors found
     */
    errors: TranslationError[];
    /**
     * Original YAML input
     */
    yaml: string;

    /**
     * Pluralizations used in the code
     */
    pluralizations: Set<string>;

    /**
     * Export aliases for reserved word keys (varName -> originalKey)
     */
    exportAliases: Map<string, string>;
};

/**
 * Compiles YAML translation files into TypeScript code
 * @_NO_SIDE_EFFECTS_
 */
export function compileTranslations(yaml: string): TranslationResult {
    const document = parseDocument(yaml);
    const root = document.contents;

    const result: TranslationResult = {
        errors: [],
        code: '',
        yaml,
        pluralizations: new Set(),
        exportAliases: new Map(),
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
        // Determine what imports are needed based on the generated code
        const imports: string[] = [];
        const typeImports: string[] = ['Translation'];

        // Check if pluralization features are used
        if (result.pluralizations.size > 0) {
            typeImports.push('PluralTranslation');

            // Add specific pluralization function and type imports based on usage
            for (const pluralization of result.pluralizations) {
                imports.push(pluralization);
            }
        }

        const importStatement =
            imports.length > 0
                ? `import { ${imports.join(', ')}, type ${typeImports.join(', type ')} } from '@nzyme/i18n-core';`
                : `import type { ${typeImports.join(', ')} } from '@nzyme/i18n-core';`;

        // Generate export aliases for reserved words
        let exportAliases = '';
        if (result.exportAliases.size > 0) {
            const aliases = Array.from(result.exportAliases.entries())
                .map(([varName, originalKey]) => `${varName} as ${originalKey}`)
                .join(', ');
            exportAliases = `\n\nexport { ${aliases} };`;
        }

        result.code = `${importStatement}\n\n${result.code}${exportAliases}\n`;
    }

    return result;
}

function createEmptyResult(yaml: string): TranslationResult {
    return {
        code: `export {};\n`,
        errors: [],
        yaml,
        pluralizations: new Set(),
        exportAliases: new Map(),
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

    // Check if this is a pluralization translation
    const pluralField = item.value.items.find(lang => lang.key.toString() === 'plural');
    if (pluralField) {
        compileAsPluralization(key, item.value, result);
    } else {
        compileAsRegularTranslation(key, item.value, result);
    }
}

function compileAsRegularTranslation(key: string, value: ParsedNode, result: TranslationResult) {
    if (!isMap(value)) {
        return;
    }

    let code = '';
    const params = new Set<string>();

    for (const lang of value.items) {
        const rawLangKey = lang.key.toString();
        const { language: langKey } = parseLanguageKey(rawLangKey);
        if (!lang.value) {
            continue;
        }

        const parsed = parseTranslationValue(key, rawLangKey, lang.value, result);
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

    // Get safe variable name and track alias if needed
    const varName = getSafeVarName(key);
    const isReserved = varName !== key;
    if (isReserved) {
        result.exportAliases.set(varName, key);
    }

    // For reserved words, don't export directly - will be exported via alias
    const exportKeyword = isReserved ? 'const' : 'export const';
    code = `${exportKeyword} ${varName}: ${type} = (lang${paramsSuffix}) => {\n${INDENT}switch (lang) {\n${code}${INDENT}}\n};`;

    if (result.code) {
        result.code += '\n\n';
    }

    result.code += code;
}

function compileAsPluralization(key: string, value: ParsedNode, result: TranslationResult) {
    if (!isMap(value)) {
        return;
    }

    const pluralField = value.items.find(lang => lang.key.toString() === 'plural');
    if (!pluralField || !isScalar(pluralField.value)) {
        result.errors.push({
            key,
            message: 'Plural field must specify the count parameter name',
            ...rangeToLineColumn(pluralField?.key.range || value.range, result),
        });
        return;
    }

    const countParamName = pluralField.value.toString();
    const allParams = new Set<string>([countParamName]);
    const languageCodes: string[] = [];
    const languageConstants: string[] = [];

    // Generate constants for each language
    for (const lang of value.items) {
        const rawLangKey = lang.key.toString();
        if (rawLangKey === 'plural' || !lang.value) {
            continue;
        }

        const { language: langKey } = parseLanguageKey(rawLangKey);

        const pluralizationName = getPluralizationName(langKey);
        const pluralizationConfig = (pluralization as Record<string, Pluralization | undefined>)[pluralizationName];
        if (!pluralizationConfig) {
            result.errors.push({
                key,
                lang: rawLangKey,
                message: `No pluralization support for language '${langKey}'`,
                ...rangeToLineColumn(lang.key.range, result),
            });
            continue;
        }

        if (!isMap(lang.value)) {
            result.errors.push({
                key,
                lang: rawLangKey,
                message: 'Language plural forms must be an object',
                ...rangeToLineColumn(lang.value.range, result),
            });
            continue;
        }

        const pluralFormsCode: string[] = [];
        const usedPlurals = new Set<string>();

        result.pluralizations.add(pluralizationName);

        // Process each plural form
        for (const pluralForm of lang.value.items) {
            if (!pluralForm.value) {
                continue;
            }

            const pluralKey = pluralForm.key.toString();
            usedPlurals.add(pluralKey);

            // Validate plural key against available plurals
            if (!pluralizationConfig.plurals.includes(pluralKey)) {
                result.errors.push({
                    key,
                    lang: rawLangKey,
                    message: `Unknown plural form '${pluralKey}' for language '${langKey}'. Available: ${pluralizationConfig.plurals.join(', ')}`,
                    ...rangeToLineColumn(pluralForm.key.range, result),
                });
                continue;
            }

            const parsed = parseTranslationValue(key, `${rawLangKey}.${pluralKey}`, pluralForm.value, result);
            if (!parsed) {
                continue;
            }

            // Only use params if there are actual parameters in this specific plural form
            const hasParams = parsed.params.length > 0;
            const paramsList = hasParams ? 'params' : '()';
            pluralFormsCode.push(`${INDENT}${pluralKey}: ${paramsList} => ${parsed.translation},`);

            for (const param of parsed.params) {
                allParams.add(param);
            }
        }

        // Check for missing required plurals
        const requiredPlurals = pluralizationConfig.plurals.filter(
            plural => !pluralizationConfig.optionalPlurals?.includes(plural),
        );
        for (const requiredPlural of requiredPlurals) {
            if (!usedPlurals.has(requiredPlural)) {
                result.errors.push({
                    key,
                    lang: rawLangKey,
                    message: `Missing required plural form '${requiredPlural}' for language '${langKey}'`,
                    ...rangeToLineColumn(lang.value.range, result),
                });
            }
        }

        // Get safe variable name for the key
        const varName = getSafeVarName(key);
        const constantName = `${varName}_${langKey}`;
        const langConstant = `const ${constantName}: PluralTranslation<typeof ${pluralizationName}, { ${Array.from(
            allParams,
        )
            .map(p => `${p}: ${p === countParamName ? 'number' : 'unknown'}`)
            .join('; ')} }> = {\n${pluralFormsCode.join('\n')}\n};`;

        languageConstants.push(langConstant);
        languageCodes.push(langKey);
    }

    if (languageConstants.length === 0) {
        return;
    }

    // Get safe variable name and track alias if needed
    const varName = getSafeVarName(key);
    const isReserved = varName !== key;
    if (isReserved) {
        result.exportAliases.set(varName, key);
    }

    // Generate the main translation function
    const switchCases = languageCodes
        .map(langKey => {
            const pluralizationName = getPluralizationName(langKey);
            return `${INDENT}${INDENT}case '${langKey}':\n${INDENT}${INDENT}${INDENT}return ${pluralizationName}.pluralize(params.${countParamName}, ${varName}_${langKey})?.(params);`;
        })
        .join('\n');

    const paramsType = Array.from(allParams)
        .map(p => `${p}: ${p === countParamName ? 'number' : 'unknown'}`)
        .join('; ');

    // For reserved words, don't export directly - will be exported via alias
    const exportKeyword = isReserved ? 'const' : 'export const';
    const mainFunction = `${exportKeyword} ${varName}: Translation<{ ${paramsType} }> = (lang, params) => {\n${INDENT}switch (lang) {\n${switchCases}\n${INDENT}}\n};`;

    const fullCode = `${languageConstants.join('\n\n')}\n\n${mainFunction}`;

    if (result.code) {
        result.code += '\n\n';
    }

    result.code += fullCode;
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

    const value = fixOrphans(item.toString().trim());
    const params: string[] = [];
    const translation: string[] = [];

    let index = 0;
    let match: RegExpExecArray | null;

    while ((match = SLOT_REGEX.exec(value))) {
        if (match.index && match.index > index) {
            // handle a piece of text
            const text = escapeCharacters(value.substring(index, match.index));
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
        const text = escapeCharacters(value.substring(index));
        translation.push(JSON.stringify(text));
    }

    return {
        translation: translation.length === 1 ? translation[0] : `[${translation.join(', ')}]`,
        params: params,
    };
}

function escapeCharacters(text: string) {
    return text
        .replace(ESCAPE_REGEX, '$1')
        .replace(/__/g, '\u00A0') // Replace __ with normal unbreakable space
        .replace(/_/g, '\u202F')
        .replace(/--/g, '\u2011'); // Replace -- with narrow unbreakable hyphen
}

/**
 * Parses a language key that may contain tags in brackets.
 * Examples:
 * - "en" returns { language: "en", tags: [] }
 * - "en[auto]" returns { language: "en", tags: ["auto"] }
 * - "en[auto,draft]" returns { language: "en", tags: ["auto", "draft"] }
 * @__NO_SIDE_EFFECTS__
 */
function parseLanguageKey(langKey: string): { language: string; tags: string[] } {
    const match = LANG_TAG_REGEX.exec(langKey);

    if (match) {
        const language = match[1]!;
        const tagsString = match[2]!;
        const tags = tagsString.split(' ').map(tag => tag.trim());
        return { language, tags };
    }

    return { language: langKey, tags: [] };
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

function getPluralizationName(lang: string) {
    return `pluralization${capitalizeFirstLetter(lang)}`;
}

/**
 * Gets the safe variable name for a key, escaping reserved words with a $ suffix.
 * Returns the original key if it's not a reserved word.
 * @__NO_SIDE_EFFECTS__
 */
function getSafeVarName(key: string): string {
    return RESERVED_WORDS.has(key) ? `${key}$` : key;
}
