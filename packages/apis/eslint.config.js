import { imports, jsdoc, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...jsdoc(),
    ...imports(),
];
