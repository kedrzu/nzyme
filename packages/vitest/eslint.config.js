import { imports, jsdoc, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'node' }),
    ...jsdoc(),
    ...imports(),
];
