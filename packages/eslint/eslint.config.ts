import { imports, jsdoc, packageJson, typescript, common } from './src/index.js';

export default [
    //
    ...common(),
    ...typescript({ target: 'node', project: ['./tsconfig.json', './tsconfig.node.json'] }),
    ...jsdoc(),
    ...imports(),
    ...packageJson(),
];
