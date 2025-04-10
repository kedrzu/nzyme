import { common, imports, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ target: 'browser' }),
    ...imports(),
    ...jsdoc(),
    ...vue(),
    ...packageJson(),
];
