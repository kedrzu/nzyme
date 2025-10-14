import * as path from 'path';

/**
 *
 */
export interface EnvFilePathOptions {
    /**
     *
     */
    cwd?: string;
    /**
     *
     */
    file?: string;
}

/**
 *
 */

/**
 *
 */
export function getEnvFilePath(options: EnvFilePathOptions) {
    const cwd = options.cwd ?? process.cwd();
    const fileName = options.file ?? '.env';
    return path.join(cwd, fileName);
}
