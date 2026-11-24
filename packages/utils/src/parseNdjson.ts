/**
 * Parses newline-delimited JSON written by a process that may have been killed mid-write: empty
 * lines are skipped and parsing stops at the first line that is not valid JSON, which can only be the
 * last one, cut short.
 * @util
 *
 * @param text - The file contents
 * @returns The parsed value of every complete line, in order
 *
 * @example
 * ```typescript
 * const results = parseNdjson(await readFile(file, 'utf8')) as TestResult[];
 * ```
 */
export function parseNdjson(text: string): unknown[] {
    const values: unknown[] = [];
    for (const line of text.split('\n')) {
        if (line === '') {
            continue;
        }
        try {
            values.push(JSON.parse(line));
        } catch {
            break;
        }
    }
    return values;
}
