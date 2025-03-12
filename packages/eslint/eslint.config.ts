import { imports, jsdoc, typescript } from './src/index.js';

export default [
    //
    ...typescript({ target: 'node' }),
    ...jsdoc(),
    ...imports(),
];
