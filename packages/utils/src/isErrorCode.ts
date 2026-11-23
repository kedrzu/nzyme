/**
 * Checks whether an error carries the given `code`, such as the `ENOENT` of a missing file.
 *
 * Narrows to the errno shape, so no `(error as NodeJS.ErrnoException)` cast is needed.
 * @util
 *
 * @param error - The caught value
 * @param code - The expected error code
 * @returns True if the value is an `Error` whose `code` equals `code`
 *
 * @example
 * ```typescript
 * try {
 *     await readFile(file);
 * } catch (error) {
 *     if (!isErrorCode(error, 'ENOENT')) {
 *         throw error;
 *     }
 * }
 * ```
 */
export function isErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === code;
}
