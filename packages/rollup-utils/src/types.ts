import type { InputOptions, OutputOptions } from 'rollup';

/**
 * Extended Rollup configuration options that include both input and output options.
 * This type combines Rollup's InputOptions with a required output configuration.
 */
export type RollupOptions = InputOptions & {
    output: OutputOptions;
};
