import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Expands a leading `~` (alone or as `~/…`) to the home directory; any other path is returned as is.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function expandHome(dir: string): string {
    return dir === '~' || dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(1)) : dir;
}
