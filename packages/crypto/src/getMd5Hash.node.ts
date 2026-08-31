import type { BinaryLike } from 'node:crypto';
import { createHash } from 'node:crypto';

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
    const hashData = typeof data === 'string' || ArrayBuffer.isView(data) ? data : new Uint8Array(data);
    return createHash('md5').update(hashData).digest('hex');
}
