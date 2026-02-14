import chalk from 'chalk';
import { emptyDir } from 'fs-extra/esm';
import { rollup } from 'rollup';

import { formatElapsedMs } from '@nzyme/utils/formatElapsedMs.js';

import type { RollupOptions } from './types.js';

/**
 * Compiles a Rollup bundle with the given configuration options.
 *
 * @param options - The Rollup configuration options including input and output settings
 * @throws {Error} If the output directory cannot be cleared or if compilation fails
 * @returns A promise that resolves when compilation is complete
 */
export async function rollupCompile(options: RollupOptions) {
    const start = performance.now();

    if (options.output.dir) {
        await emptyDir(options.output.dir);
    }

    const result = await rollup(options);

    await result.write(options.output);
    await result.close();

    console.info(`Compiled in ${chalk.green(formatElapsedMs(start))}`);
}
