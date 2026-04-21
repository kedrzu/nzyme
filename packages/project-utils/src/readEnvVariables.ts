import * as fs from 'fs/promises';

import { parse } from 'dotenv';
import { pathExists } from 'fs-extra';

import { getEnvFilePath } from './getEnvFilePath.js';
import type { EnvFilePathOptions } from './getEnvFilePath.js';

/** Reads and parses environment variables from a dotenv file, returning an empty object if the file does not exist. */
export async function readEnvVariables(options: EnvFilePathOptions): Promise<Record<string, string>> {
    const filePath = getEnvFilePath(options);

    if (await pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        return parse(fileContent);
    }

    return {};
}
