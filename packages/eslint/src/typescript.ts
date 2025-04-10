import workspaces from 'eslint-plugin-workspaces';
import monorepo from 'eslint-plugin-monorepo';
import globals from 'globals';
import js from '@eslint/js';

import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { Linter } from 'eslint';

export type Target = 'node' | 'browser';

export interface TypescriptOptions {
    target?: Target[] | Target;
    project?: string | string[];
}

export function typescript(options: TypescriptOptions = {}) {
    const config: Linter.Config = {
        ignores: ['dist/**/*', 'dist-*/**/*', 'node_modules/**/*', 'eslint.config.js'],
        files: ['**/*.{ts,tsx}'],
        plugins: {
            workspaces,
            monorepo,
        },
        languageOptions: {
            parserOptions: {
                project: options.project || './tsconfig.json',
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
            'workspaces/no-relative-imports': 'error',
            'workspaces/no-absolute-imports': 'error',
            'workspaces/require-dependency': 'error',
            'monorepo/no-relative-import': 'error',
        },
    };

    if (Array.isArray(options.target)) {
        config.languageOptions = {
            ...config.languageOptions,
            globals: options.target.reduce(
                (acc, target) => ({ ...acc, ...getTargetGlobals(target) }),
                {},
            ),
        };
    } else if (options.target) {
        config.languageOptions = {
            ...config.languageOptions,
            globals: getTargetGlobals(options.target),
        };
    }

    return tseslint.config({
        extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked, prettier],
        ...config,
    });
}

function getTargetGlobals(target: Target) {
    switch (target) {
        case 'node':
            return globals.node;
        case 'browser':
            return globals.browser;
    }
}
