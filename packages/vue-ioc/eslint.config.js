import { imports, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...typescript({ target: 'browser' }),
    ...imports(),
    ...jsdoc(),
    ...vue(),
    ...packageJson(),
];
