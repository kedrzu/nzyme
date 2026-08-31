import * as path from 'node:path';

/** Options for resolving the path to an environment file. */
export interface EnvFilePathOptions {
    /** Working directory to resolve from. Defaults to process.cwd(). */
    cwd?: string;
    /** Name of the env file. Defaults to '.env'. */
    file?: string;
}

/** Resolves the absolute path to an environment file. */
export function getEnvFilePath(options: EnvFilePathOptions) {
    const cwd = options.cwd ?? process.cwd();
    const fileName = options.file ?? '.env';
    return path.join(cwd, fileName);
}
