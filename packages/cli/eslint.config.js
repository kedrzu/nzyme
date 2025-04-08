import { imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'node', project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...imports(),
    ...packageJson(),
];
