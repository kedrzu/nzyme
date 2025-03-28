import { $ } from 'execa';

/**
 * Options for the loginLocally function.
 */
export interface LoginLocallyOptions {
    /**
     * Pulumi state backend.
     * @default process.env.PULUMI_BACKEND_URL || 'file://./.pulumi'
     */
    backend?: string;

    /**
     * The cwd for the login command.
     * @default process.cwd()
     */
    cwd?: string;
}

/**
 * Logs into Pulumi locally.
 */
export async function login(options: LoginLocallyOptions = {}) {
    const backend = options.backend || process.env.PULUMI_BACKEND_URL || 'file://./.pulumi';
    const cwd = options.cwd ?? process.cwd();
    const cli = $({ cwd, all: true, shell: true });

    await cli`pulumi login ${backend} --non-interactive`;
}
