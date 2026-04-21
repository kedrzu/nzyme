import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

export default [
    //
    globalIgnores(['bin/**/*']),
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        target: 'node',
        internalImports: ['@nzyme/*'],
    }),
    ...packageJson(),
    ...jsdoc(),
];
