import { globalIgnores } from 'eslint/config';

import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    globalIgnores(['./src/shims.d.ts']),
    ...common(),
    ...typescript({
        target: 'node',
        project: ['./tsconfig.json'],
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
