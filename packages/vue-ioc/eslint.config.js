import { common, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({ rootDir: import.meta.dirname }),
    ...jsdoc(),
    ...vue(),
    ...packageJson(),
];
