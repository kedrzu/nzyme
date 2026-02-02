import { jsdoc, packageJson, typescript, common } from './src/index.js';

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
