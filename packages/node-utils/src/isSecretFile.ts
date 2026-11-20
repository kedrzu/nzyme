import * as path from 'node:path';

/**
 * Whether a file name looks like a secrets file — `.env*`, `*-credentials.json`, `*-tokens.json` —
 * which an agent command must never upload, attach or overwrite, even inside an allowed directory.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isSecretFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    return name.startsWith('.env') || /-(credentials|tokens)\.json$/.test(name);
}
