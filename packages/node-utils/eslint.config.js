import { common, jsdoc, packageJson, typescript } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        target: 'node',
        project: ['./tsconfig.json'],
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...packageJson(),
];
