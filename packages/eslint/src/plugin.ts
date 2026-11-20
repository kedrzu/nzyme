import type { ESLint } from 'eslint';

import { exportsSourceFirst } from './rules/exportsSourceFirst.js';
import { filesCoverExports } from './rules/filesCoverExports.js';
import { markdownFormat } from './rules/markdownFormat.js';
import { publishAccessPublic } from './rules/publishAccessPublic.js';

/**
 * The `nzyme` ESLint plugin with every custom rule. Presets share this one object: flat config
 * refuses two different plugin objects registered under the same name.
 */
// oxlint-disable-next-line nzyme/no-module-state -- ESLint types its rule and plugin objects with mutable arrays (`meta.schema`, `docs.dialects`), so this one cannot be typed `Immutable`; nothing writes it.
export const nzymePlugin: ESLint.Plugin = {
    meta: { name: '@nzyme/eslint' },
    rules: {
        'exports-source-first': exportsSourceFirst,
        'files-cover-exports': filesCoverExports,
        'markdown-format': markdownFormat,
        'publish-access-public': publishAccessPublic,
    },
};
