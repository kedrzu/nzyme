import { common, jsdoc, packageJson, typescript } from './src/index.js';

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
