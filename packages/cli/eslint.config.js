import { imports, jsdoc, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'node', project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...jsdoc(),
    ...imports(),
];
