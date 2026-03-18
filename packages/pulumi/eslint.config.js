import { globalIgnores } from 'eslint/config';

import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    globalIgnores(['./src/shims.d.ts']),
    ...common(),
    ...typescript({
        rootDir: import.meta.dirname,
        target: 'node',
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
