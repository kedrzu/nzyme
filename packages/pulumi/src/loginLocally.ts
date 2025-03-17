import { resolve } from 'path';

import { $ } from 'execa';
import { ensureDir } from 'fs-extra';

/**
 * Options for the loginLocally function.
 */
export interface LoginLocallyOptions {
    /**
     * The directory for the Pulumi state.
     * @default './'
     */
    dir?: string;

    /**
     * The cwd for the login command.
     * @default process.cwd()
     */
    cwd?: string;
}

/**
 * Logs in to Pulumi locally.
 */
export async function loginLocally(options: LoginLocallyOptions = {}) {
    const dir = options.dir ?? './';
    const cwd = options.cwd ?? process.cwd();
    const cli = $({ cwd, all: true, shell: true });
    const path = resolve(cwd, dir);
    const backendUrl = `file://${path}`;

    await ensureDir(path);
    await cli`pulumi login ${backendUrl} --non-interactive`;

    // Make the Pulumi CLI use the local backend.
    process.env.PULUMI_BACKEND_URL = backendUrl;
    process.env.PULUMI_CONFIG_PASSPHRASE = 'dummy';
}
