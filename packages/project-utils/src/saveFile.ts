import { outputFile } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

/**
 * Save a file with prettier formatting.
 */
export async function saveFile(path: string, content: string) {
    const config = await resolveConfig(path);
    const formatted = await format(content, { ...config, filepath: path });

    await outputFile(path, formatted, { encoding: 'utf8' });
}
