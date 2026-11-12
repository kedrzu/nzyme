import { assertNever } from '@nzyme/utils/assertNever.js';

/**
 * How a specifier is resolved:
 * - `module` — module resolution: relative (`.js` → `.ts`, `index`), workspace package `exports`,
 *   configured aliases;
 * - `sass` — Sass load rules: relative first (partials `_x.scss`, `_index.scss`), then packages;
 * - `url` — a file path relative to the importing file (`new URL('x', import.meta.url)`); a
 *   directory resolves to nothing.
 */
export type ImportSpecifierKind = 'module' | 'sass' | 'url';

/** A module specifier found in a source file. */
export interface ImportSpecifier {
    specifier: string;
    /** `import type …` / `export type …` — erased at compile time. */
    typeOnly: boolean;
    kind: ImportSpecifierKind;
}

/** Source file kinds with import forms beyond plain ESM. */
export type ImportSourceKind = 'script' | 'vue' | 'scss';

/**
 * The kind of source file a path is by its extension — `.ts .tsx .mts .js .mjs` (`.d.ts`
 * included), `.vue`, `.scss` — or `null` for a file that is not parsed for imports.
 * @__NO_SIDE_EFFECTS__
 */
export function getImportSourceKind(file: string): ImportSourceKind | null {
    const extension = /\.[^./]+$/.exec(file)?.[0];
    switch (extension) {
        case '.ts':
        case '.tsx':
        case '.mts':
        case '.js':
        case '.mjs':
            return 'script';
        case '.vue':
            return 'vue';
        case '.scss':
            return 'scss';
        default:
            return null;
    }
}

/**
 * Extracts every ESM module specifier: static `import … from`, `export … from`, side-effect
 * `import 'x'` and dynamic `import('literal')`. Comments are stripped first, so an `import` in JSDoc
 * is not an import.
 * @__NO_SIDE_EFFECTS__
 */
export function extractEsmSpecifiers(rawContent: string): ImportSpecifier[] {
    const content = stripComments(rawContent);
    const specifiers: ImportSpecifier[] = [];
    const patterns = [
        /\b(?:import|export)\s+(type\s)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g, // import ... from 'x'  /  export ... from 'x'
        /\bimport\s*()['"]([^'"]+)['"]/g, // import 'x' (side-effect)
        /\bimport\s*\(\s*()['"]([^'"]+)['"]\s*\)/g, // import('x') (dynamic)
    ];

    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content))) {
            const specifier = match[2];
            if (specifier) {
                specifiers.push({ specifier, typeOnly: Boolean(match[1]), kind: 'module' });
            }
        }
    }

    return specifiers;
}

/**
 * Extracts the import forms that are not plain ESM statements:
 * - `script`: `new URL('literal', import.meta.url)`;
 * - `vue`: ESM imports and `new URL` inside `<script>` blocks, `src="…"` on
 *   `<script|template|style>`, and `@use`/`@import`/`@forward` inside `<style lang="scss">`;
 * - `scss`: `@use`/`@import`/`@forward`.
 *
 * For a `.vue` file this is the whole extraction — never run {@link extractEsmSpecifiers} on the raw
 * SFC, its template text is not code.
 * @__NO_SIDE_EFFECTS__
 */
export function extractImplicitSpecifiers(content: string, sourceKind: ImportSourceKind): ImportSpecifier[] {
    switch (sourceKind) {
        case 'script':
            return extractUrlSpecifiers(stripComments(content));
        case 'scss':
            return extractSassSpecifiers(stripComments(content));
        case 'vue':
            return extractVueSpecifiers(content);
        default:
            return assertNever(sourceKind);
    }
}

function extractVueSpecifiers(rawContent: string): ImportSpecifier[] {
    const content = rawContent.replace(/<!--[\s\S]*?-->/g, '');
    const specifiers: ImportSpecifier[] = [];

    for (const match of content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        const block = match[1] ?? '';
        specifiers.push(...extractEsmSpecifiers(block), ...extractUrlSpecifiers(stripComments(block)));
    }

    for (const match of content.matchAll(/<(?:script|template|style)\b[^>]*?\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        const specifier = match[1];
        if (specifier) {
            specifiers.push({ specifier, typeOnly: false, kind: 'module' });
        }
    }

    for (const match of content.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
        if (/\blang\s*=\s*["']scss["']/i.test(match[1] ?? '')) {
            specifiers.push(...extractSassSpecifiers(stripComments(match[2] ?? '')));
        }
    }

    return specifiers;
}

function extractUrlSpecifiers(content: string): ImportSpecifier[] {
    const specifiers: ImportSpecifier[] = [];
    for (const match of content.matchAll(/\bnew\s+URL\s*\(\s*(['"`])([^'"`$]+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
        const specifier = match[2];
        if (specifier) {
            specifiers.push({ specifier, typeOnly: false, kind: 'url' });
        }
    }
    return specifiers;
}

/** `@use 'x' as y with (…)` / `@forward 'x'` name one module; `@import 'a', 'b'` may list several. */
function extractSassSpecifiers(content: string): ImportSpecifier[] {
    const specifiers: ImportSpecifier[] = [];
    for (const match of content.matchAll(/@(use|forward|import)\s+([^;]+)/g)) {
        const [, rule, args = ''] = match;
        const strings =
            rule === 'import' ? args.matchAll(/(?<!url\(\s*)(['"])([^'"]+)\1/g) : [args.match(/^(['"])([^'"]+)\1/)];
        for (const quoted of strings) {
            const specifier = quoted?.[2];
            if (specifier) {
                specifiers.push({ specifier, typeOnly: false, kind: 'sass' });
            }
        }
    }
    return specifiers;
}

/**
 * Removes line and block comments so `import`/`from` inside JSDoc examples isn't mistaken for a
 * real import. String/template literals are preserved so specifiers in code are untouched.
 */
function stripComments(content: string): string {
    const tokens = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
    return content.replace(tokens, (_match, stringLiteral: string | undefined) => stringLiteral ?? '');
}
