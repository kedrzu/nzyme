import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
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
