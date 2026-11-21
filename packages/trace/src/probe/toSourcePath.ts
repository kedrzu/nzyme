import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The absolute path of a source a source map names (resolved already, or a `file:` URL), without
 * its query or fragment: a bundler names one file several ways (`icon.svg?component`,
 * `Card.vue?vue&type=style&index=0`).
 * @__NO_SIDE_EFFECTS__
 */
export function toSourcePath(source: string): string {
    const bare = source.replace(/[?#].*$/s, '');
    return path.resolve(bare.startsWith('file:') ? fileURLToPath(bare) : bare);
}
