/**
 * Check if a file is a valid TypeScript type file
 * @param filePath Path to check
 * @returns True if the file is a .type.ts file
 * @__NO_SIDE_EFFECTS__
 */
export function isTypeFile(filePath: string): boolean {
    return filePath.endsWith('.type.ts');
}
