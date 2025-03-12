import { jsdoc, typescript, imports } from '@nzyme/eslint';

export default [
    //
    ...typescript(),
    ...jsdoc(),
    ...imports(),
];
