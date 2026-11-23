/**
 * Collapses every run of whitespace to one space and trims the ends, so formatting alone changes
 * no hash.
 * @__NO_SIDE_EFFECTS__
 */
export function normalizeWhitespace(text: string) {
    return text.replaceAll(/\s+/g, ' ').trim();
}
