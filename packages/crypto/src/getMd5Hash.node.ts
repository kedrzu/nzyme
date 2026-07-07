import type { BinaryLike } from 'crypto';
import { createHash } from 'crypto';

/**
 * Calculates the MD5 hash of the provided data (Node.js implementation)
 *
 * Uses the Node.js crypto module to generate a hexadecimal MD5 hash.
 *
 * @util
 * @param data - The data to hash, can be a string, Buffer, or other BinaryLike type
 * @returns Hexadecimal MD5 hash string
 */
export function getMd5Hash(data: BinaryLike): string {
    return createHash('md5').update(data).digest('hex');
}
