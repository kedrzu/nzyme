import { imports, jsdoc, packageJson, typescript } from './src/index.js';

export default [
    //
    ...typescript({ target: 'node', project: ['./tsconfig.json', './tsconfig.node.json'] }),
    ...jsdoc(),
    ...imports(),
    ...packageJson(),
];
