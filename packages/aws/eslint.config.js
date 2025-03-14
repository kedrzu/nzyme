import { imports, jsdoc, typescript } from '@nzyme/eslint';

export default [
    //
    ...typescript(),
    ...jsdoc(),
    ...imports(),
];
