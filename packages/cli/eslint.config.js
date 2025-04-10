import { common, imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ target: 'node', project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...imports(),
    ...packageJson(),
    ...jsdoc(),
];
