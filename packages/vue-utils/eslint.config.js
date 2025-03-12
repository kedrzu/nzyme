import { jsdoc, typescript, imports } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'browser' }),
    ...jsdoc(),
    ...imports(),
];
