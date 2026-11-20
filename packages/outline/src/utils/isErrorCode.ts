/**
 * Whether `error` is a Node system error with this `code` (`ENOENT`, `ENOTEMPTY`, ...).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}
