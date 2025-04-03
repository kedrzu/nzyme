import { imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'browser' }),
    ...imports(),
    ...jsdoc(),
    ...packageJson(),
];
