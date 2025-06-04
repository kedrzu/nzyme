import { outputFile } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

/**
 * Save a file with prettier formatting.
 */
export async function saveFile(path: string, content: string) {
    const config = await resolveConfig(path);

    try {
        content = await format(content, { ...config, filepath: path });
    } catch (error) {
        console.error(`Failed to format ${path}`, error);
    }

    await outputFile(path, content, { encoding: 'utf8' });
}
