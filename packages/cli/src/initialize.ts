import { patchNodeWarnings } from '@nzyme/node-utils';
import { loadEnvVariables } from '@nzyme/project-utils';

/**
 * Options for initializing the CLI.
 */
export interface InitializeOptions {
    /**
     * The environment to load files for.
     * When provided, it will load files with the `.env.<env>` format.
     */
    env?: string | string[];
    /**
     * The working directory to load the environment file from.
     */
    cwd?: string;
}

/**
 * Initialize the CLI.
 */
export function initialize(options: InitializeOptions = {}) {
    patchNodeWarnings();
    loadEnvVariables({ env: options.env });
}
