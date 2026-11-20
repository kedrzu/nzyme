import { readFileIfExists } from './readFileIfExists.js';

/**
 * The file's text as UTF-8, or `null` when there is no file at `path`; any other read error throws.
 * @util
 */
export async function readTextIfExists(path: string): Promise<string | null> {
    const bytes = await readFileIfExists(path);
    return bytes == null ? null : bytes.toString('utf8');
}
