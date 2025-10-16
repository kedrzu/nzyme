import { common, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ target: 'browser', internalImports: ['@nzyme/*'] }),
    ...vue(),
    ...jsdoc(),
    ...packageJson(),
];
