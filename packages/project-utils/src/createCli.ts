import { $ } from 'execa';
import type { ExecaScriptMethod, Options } from 'execa';

/**
 * The options for the CLI process.
 */
export type CreateCliOptions = {
    /**
     * The current working directory for the CLI process.
     */
    cwd?: string;
    /**
     * The environment variables for the CLI process.
     */
    env?: NodeJS.ProcessEnv;

    /**
     *
     */
    stderr?: Options['stderr'];
    /**
     *
     */
    stdout?: Options['stdout'];
};

/**
 * Creates a new CLI process.
 * @param options - The options for the CLI process.
 * @returns A promise that resolves when the CLI process is finished.
 */
export function createCli(options: CreateCliOptions = {}): ExecaScriptMethod {
    return $({
        cwd: options.cwd || process.cwd(),
        stdout: options.stdout || 'inherit',
        stderr: options.stderr || 'inherit',
        env: options.env || process.env,
        shell: true,
    });
}
