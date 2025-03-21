import chalk from 'chalk';
import { consola } from 'consola';
import { emptyDir } from 'fs-extra/esm';
import { rollup } from 'rollup';

import { formatElapsedMs } from '@nzyme/utils';

import type { RollupOptions } from './types.js';

/**
 * Compiles a Rollup bundle.
 */
export async function rollupCompile(options: RollupOptions) {
    const start = performance.now();

    if (options.output.dir) {
        await emptyDir(options.output.dir);
    }

    const result = await rollup(options);

    await result.write(options.output);
    await result.close();

    consola.success(`Compiled in ${chalk.green(formatElapsedMs(start))}`);
}
