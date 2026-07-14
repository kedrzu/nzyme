/**
 * Extracts filename from the Content-Disposition header of a Response.
 * @util
 * @param response - The Response object to extract filename from
 * @returns The filename if found in Content-Disposition header, null otherwise
 *
 * @example
 * ```ts
 * const response = await fetch('https://example.com/file');
 * const filename = getResponseFileName(response);
 * console.log(filename); // 'document.pdf' or null
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getResponseFileName(response: Response): string | null {
    const contentDisposition = response.headers.get('Content-Disposition');

    if (!contentDisposition) {
        return null;
    }

    const match = /filename="?([^"]+)"?/.exec(contentDisposition);
    return match?.[1] ?? null;
}
