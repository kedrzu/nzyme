import tseslint from 'typescript-eslint';
import importsPlugin from 'eslint-plugin-import';

export interface ImportGroup {
    pattern: string;
    group: 'builtin' | 'external' | 'internal' | 'parent' | 'sibling' | 'index';
    position?: 'before' | 'after';
}

export interface ImportsOptions {
    groups?: ImportGroup[];
}

export function imports(options: ImportsOptions = {}) {
    return tseslint.config({
        extends: [importsPlugin.flatConfigs.recommended, importsPlugin.flatConfigs.typescript],
        ignores: ['dist/**/*', 'node_modules/**/*'],
        rules: {
            'sort-imports': [
                'warn',
                {
                    ignoreCase: false,
                    ignoreDeclarationSort: true,
                    ignoreMemberSort: false,
                    allowSeparatedGroups: true,
                },
            ],
            'import/order': [
                'warn',
                {
                    'newlines-between': 'always',
                    groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
                    // https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/order.md#pathgroups-array-of-objects
                    pathGroups: options.groups ?? [
                        {
                            pattern: '@nzyme/**',
                            group: 'internal',
                            position: 'before',
                        },
                    ],
                    pathGroupsExcludedImportTypes: ['builtin'],
                    alphabetize: {
                        order: 'asc',
                    },
                },
            ],
            // we have TypeScript handling that
            'import/no-unresolved': 'off',
        },
    });
}
