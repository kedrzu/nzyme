import * as fs from 'fs/promises';

import { parse } from 'dotenv';
import { pathExists } from 'fs-extra';

import { getEnvFilePath } from './getEnvFilePath.js';
import type { EnvFilePathOptions } from './getEnvFilePath.js';

/**
 * Reads environment variables from a file.
 */

/**
 *
 */
export async function readEnvVariables(options: EnvFilePathOptions): Promise<Record<string, string>> {
    const filePath = getEnvFilePath(options);

    if (await pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        return parse(fileContent);
    }

    return {};
}
