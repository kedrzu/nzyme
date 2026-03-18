import { common, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        target: 'browser',
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...vue(),
    ...packageJson(),
];
