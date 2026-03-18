import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        target: 'node',
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
