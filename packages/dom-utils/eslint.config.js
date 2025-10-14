import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        target: 'browser',
        project: ['./tsconfig.json', './tsconfig.tests.json'],
        internalImports: ['@nzyme/*', 'nzyme', 'nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
