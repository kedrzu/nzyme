import jsdocPlugin from 'eslint-plugin-jsdoc';
import { defineConfig } from 'eslint/config';

export interface JsdocOptions {
    ignores?: string[];
}

export function jsdoc(options: JsdocOptions = {}) {
    return defineConfig({
        plugins: {
            jsdoc: jsdocPlugin,
        },
        ignores: ['dist/**/*', 'dist-*/**/*', 'node_modules/**/*', ...(options.ignores || [])],
        rules: {
            'jsdoc/require-jsdoc': [
                1,
                {
                    publicOnly: {
                        esm: true,
                        cjs: false,
                    },

                    contexts: [
                        'ClassDeclaration',
                        'ClassProperty',
                        'FunctionDeclaration',
                        'MethodDefinition',
                        'ExportNamedDeclaration > VariableDeclaration',
                        'TSDeclareFunction',
                        'TSEnumDeclaration',
                        'TSInterfaceDeclaration',
                        'TSMethodSignature',
                        ':not(TSTypeParameterDeclaration) TSPropertySignature',
                        'TSTypeAliasDeclaration',
                    ],
                },
            ],

            'jsdoc/no-blank-block-descriptions': 'warn',
            'jsdoc/no-blank-blocks': 'warn',
        },
    });
}
