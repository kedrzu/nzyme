import { common, imports, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ target: 'browser' }),
    ...imports(),
    ...jsdoc(),
    ...packageJson(),
];
