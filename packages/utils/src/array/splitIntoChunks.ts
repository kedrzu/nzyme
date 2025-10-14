/**
 * Splits an array into chunks of a specified size.
 *
 * @template T - The type of elements in the array
 * @param array - The array to split into chunks
 * @param chunkSize - The size of each chunk (must be greater than 0)
 * @returns An array of arrays, where each inner array contains up to chunkSize elements
 * @throws Error if chunkSize is less than 1
 */
export function splitIntoChunks<T>(array: readonly T[], chunkSize: number) {
    if (chunkSize < 1) {
        throw new Error('Chunk must be greater than 0');
    }

    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        result.push(chunk);
    }

    return result;
}
