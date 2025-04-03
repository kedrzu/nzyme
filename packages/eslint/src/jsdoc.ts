import jsdocPlugin from 'eslint-plugin-jsdoc';

import { Linter } from 'eslint';

export function jsdoc(): Linter.Config[] {
    return [
        {
            plugins: {
                jsdoc: jsdocPlugin,
            },
            ignores: ['dist/**/*', 'node_modules/**/*'],
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
        },
    ];
}
