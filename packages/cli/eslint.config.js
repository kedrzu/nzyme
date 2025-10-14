import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        target: 'node',
        project: ['./tsconfig.json', './tsconfig.tests.json'],
        internalImports: ['@nzyme/*'],
    }),
    ...packageJson(),
    ...jsdoc(),
];
