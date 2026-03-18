import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        target: 'browser',
        internalImports: ['@nzyme/*', 'nzyme', 'nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
