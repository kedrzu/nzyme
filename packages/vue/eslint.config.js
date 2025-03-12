import { jsdoc, typescript, imports, vue } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'browser' }),
    ...jsdoc(),
    ...imports(),
    ...vue(),
];
