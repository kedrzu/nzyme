import { common, jsdoc, packageJson, typescript, vue } from '@nzyme/eslint';

export default [
    //
    ...common(),
    ...typescript({
        project: ['./tsconfig.json'],
        target: 'browser',
        internalImports: ['@nzyme/*'],
    }),
    ...jsdoc(),
    ...vue(),
    ...packageJson(),
];
