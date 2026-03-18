import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

export default [
    //
    globalIgnores(['./tests/**/*']),
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc({
        ignores: ['tests/**/*'],
    }),
    ...packageJson(),
];
