import SparkMd5 from 'spark-md5';

/**
 * Calculates the MD5 hash of the provided data (browser implementation)
 *
 * Uses the spark-md5 library for browser-compatible MD5 hash generation.
 *
 * @util
 * @param data - The string data to hash
 * @returns Hexadecimal MD5 hash string
 */
export function getMd5Hash(data: string): string {
    return SparkMd5.hash(data);
}
