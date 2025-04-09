import { imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...imports(),
    ...jsdoc(),
    ...packageJson(),
    {
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },
];
