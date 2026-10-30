import type { ESLint } from 'eslint';

import { exportsSourceFirst } from './rules/exportsSourceFirst.js';
import { markdownFormat } from './rules/markdownFormat.js';

/**
 * The `nzyme` ESLint plugin with every custom rule. Presets share this one object: flat config
 * refuses two different plugin objects registered under the same name.
 */
export const nzymePlugin: ESLint.Plugin = {
    meta: { name: '@nzyme/eslint' },
    rules: {
        'exports-source-first': exportsSourceFirst,
        'markdown-format': markdownFormat,
    },
};
