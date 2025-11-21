/**
 * Extracts the file path of the caller from the current stack trace.
 *
 * This function uses the stack trace to determine which file called it,
 * leveraging sourcemaps to get the actual TypeScript file path.
 *
 * @param depth - The stack depth to look at (0 = immediate caller, 1 = caller's caller, etc.)
 * @returns The file path extracted from the stack trace, or undefined if not found
 *
 * @example
 * ```ts
 * // In myFile.ts
 * function myFunction() {
 *   const filePath = getCallerFilePath();
 *   console.log(filePath); // Will show the path to myFile.ts
 * }
 * ```
 */
export function getCallerFilePath(depth = 0): string | undefined {
    const stack = new Error().stack || '';
    const lines = stack.split('\n');

    // Skip the first 2 lines (Error message and this function itself)
    // Then skip additional lines based on depth
    const targetLineIndex = 2 + depth;

    const line = lines[targetLineIndex];

    if (!line) {
        return undefined;
    }

    // Try to match paths in various stack trace formats:
    // - at functionName (file:///path/to/file.ts:line:column)
    // - at functionName (/path/to/file.ts:line:column)
    // - at file:///path/to/file.ts:line:column
    // - at /path/to/file.ts:line:column

    // First try to extract path from parentheses (with function name)
    let match = line.match(/\((?:file:\/\/\/?)?(.*?\.(?:ts|js)):\d+:\d+\)/);
    if (match?.[1]) {
        return `file://${match[1].trim()}`;
    }

    // If not in parentheses, try direct path after "at"
    match = line.match(/at\s+(?:file:\/\/\/?)?(.*?\.(?:ts|js)):\d+:\d+/);
    if (match?.[1]) {
        return `file://${match[1].trim()}`;
    }

    return undefined;
}
