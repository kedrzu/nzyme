/**
 * A name from a remote service (a Drive file, an email attachment) made safe as a local file name: path
 * separators, characters illegal on disk and control characters become `_`, leading dots become one `_`
 * (no hidden file, no `..`), and surrounding whitespace is trimmed. `fallback` names a file whose name is
 * left empty.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function safeFileName(name: string, fallback: string): string {
    // Control characters sort below the space.
    const replaced = Array.from(name, char => (char < ' ' || '\\/:*?"<>|'.includes(char) ? '_' : char)).join('');
    const cleaned = replaced.replace(/^\.+/, '_').trim();
    return cleaned || fallback;
}
