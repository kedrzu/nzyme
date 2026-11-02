import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/**
 * Reads the raw `nzyme` field of `<root>/package.json`, where a repo configures the `nzyme` binary.
 * Unvalidated: each reader checks the part it owns and names the offending path itself.
 *
 * @param root - The repo root.
 * @returns The field's value, or `undefined` when the manifest has none.
 * @util
 */
export async function readNzymeConfig(root: string): Promise<unknown> {
    const packageJson: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    return isPlainObject(packageJson) ? packageJson.nzyme : undefined;
}
