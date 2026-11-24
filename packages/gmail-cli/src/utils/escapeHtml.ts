/**
 * Escapes the characters that are special in HTML text and attribute values.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
