import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

export default [
    //
    globalIgnores(['./cli/**/*']),
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
