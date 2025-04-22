/**
 * Normalizes text input to an array of strings
 *
 * @param text Text input that can be a string, array of strings, or null/undefined
 * @returns Array of strings, empty array if input is null or undefined
 */
export function normalizeLines(text: string | string[] | null | undefined) {
    if (text == null) {
        return [];
    }

    return Array.isArray(text) ? text : [text];
}
