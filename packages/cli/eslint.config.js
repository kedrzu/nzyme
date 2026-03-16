import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';
import { globalIgnores } from 'eslint/config';

export default [
    //
    globalIgnores(['bin/**/*']),
    ...common(),
    ...typescript({
        target: 'node',
        project: ['./tsconfig.json'],
        internalImports: ['@nzyme/*'],
    }),
    ...packageJson(),
    ...jsdoc(),
];
