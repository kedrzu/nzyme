import { imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'browser', project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...imports(),
    ...jsdoc(),
    ...packageJson(),
];
