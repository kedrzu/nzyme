import { createHash } from 'node:crypto';

/**
 * The hash kept in `DocState.localHash`: a file whose bytes hash differently was edited locally.
 * @__NO_SIDE_EFFECTS__
 */
export function contentHash(content: string | Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}
