import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        project: ['./tsconfig.json', './tsconfig.check.json'],
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
    {
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },
];
