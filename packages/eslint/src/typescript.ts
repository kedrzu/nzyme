import js from '@eslint/js';
import type { Linter } from 'eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import workspaces from 'eslint-plugin-workspaces';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** The runtime target environment for globals configuration. */
export type Target = 'browser' | 'node';

/** Options for the TypeScript ESLint config. */
export interface TypescriptOptions {
    /** Runtime target(s) to include appropriate globals. */
    target?: Target | Target[];
    /** Import patterns to treat as internal for sort ordering. */
    internalImports?: string[];
    /** Root directory for tsconfig resolution. Pass `import.meta.dirname` from your eslint config. */
    rootDir?: string;
}

/** Creates an ESLint config for TypeScript projects with type-checking, import sorting, and code style rules. */
export function typescript(options: TypescriptOptions = {}): Linter.Config[] {
    const config: Linter.Config = {
        ignores: [
            'dist/**/*',
            'node_modules/**/*',
            'eslint.config.js',
            'eslint.config.ts',
            'package.json',
            '**/*.loc.ts',
            'rollup.config.ts',
            'vite.config.ts',
            'drizzle.config.ts',
            'dev.ts',
            'bin/**',
        ],
        plugins: {
            workspaces,
            import: importPlugin,
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: options.rootDir ?? process.cwd(),
                extraFileExtensions: ['.vue'],
            },
        },
        rules: {
            curly: 'error',
            'require-await': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-import-type-side-effects': 'error',
            // '@typescript-eslint/explicit-member-accessibility': 'warn',
            'workspaces/no-relative-imports': 'error',
            'workspaces/no-absolute-imports': 'error',
            'workspaces/require-dependency': 'error',
            'import/consistent-type-specifier-style': ['warn', 'prefer-top-level'],
            'import/newline-after-import': 'warn',
            'import/no-duplicates': ['warn', { considerQueryString: true }],
            'perfectionist/sort-imports': [
                'warn',
                {
                    internalPattern: options.internalImports ?? [],
                    groups: [
                        ['type-builtin', 'value-builtin'],
                        ['type-external', 'value-external'],
                        ['type-internal', 'value-internal'],
                        ['type-parent', 'value-parent', 'type-sibling', 'value-sibling', 'type-index', 'value-index'],
                    ],
                },
            ],
            // often we want a custom prop order for better readability
            'perfectionist/sort-interfaces': ['warn', { type: 'unsorted' }],
            'perfectionist/sort-object-types': ['warn', { type: 'unsorted' }],
            // this is super risky, as key order is preserved in js
            'perfectionist/sort-objects': 'off',
            'perfectionist/sort-maps': 'off',
            'perfectionist/sort-sets': 'off',
            'perfectionist/sort-modules': ['warn', { type: 'unsorted' }],
            'perfectionist/sort-union-types': [
                'warn',
                {
                    type: 'natural',
                    groups: [
                        'conditional',
                        'function',
                        'import',
                        'intersection',
                        'keyword',
                        'named',
                        'object',
                        'operator',
                        'tuple',
                        'union',
                        'literal',
                        'nullish',
                    ],
                },
            ],
            'perfectionist/sort-classes': [
                'warn',
                {
                    type: 'unsorted',
                    groups: [
                        'index-signature',
                        'static-property',
                        'static-block',
                        ['public-property', 'public-accessor-property'],
                        ['public-get-method', 'public-set-method'],
                        ['protected-property', 'protected-accessor-property'],
                        ['protected-get-method', 'protected-set-method'],
                        ['private-property', 'private-accessor-property'],
                        ['private-get-method', 'private-set-method'],
                        'constructor',
                        'static-method',
                        'public-method',
                        'protected-method',
                        'private-method',
                        'unknown',
                    ],
                },
            ],
        },
    };

    if (Array.isArray(options.target)) {
        config.languageOptions = {
            ...config.languageOptions,
            globals: options.target.reduce((acc, target) => ({ ...acc, ...getTargetGlobals(target) }), {}),
        };
    } else if (options.target) {
        config.languageOptions = {
            ...config.languageOptions,
            globals: getTargetGlobals(options.target),
        };
    }

    return tseslint.config({
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommendedTypeChecked,
            prettier,
            perfectionist.configs['recommended-natural'],
        ],

        ...config,
    }) as Linter.Config[];
}

function getTargetGlobals(target: Target) {
    switch (target) {
        case 'browser':
            return globals.browser;
        case 'node':
            return globals.node;
    }
}
