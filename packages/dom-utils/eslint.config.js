import { common, imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ target: 'browser', project: ['./tsconfig.json', './tsconfig.tests.json'] }),
    ...imports(),
    ...jsdoc(),
    ...packageJson(),
];
