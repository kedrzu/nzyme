import { jsdoc, typescript, imports } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'node' }),
    ...jsdoc(),
    ...imports(),
];
