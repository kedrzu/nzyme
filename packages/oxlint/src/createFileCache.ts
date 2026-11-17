import { readFileSync, statSync } from 'node:fs';

/**
 * Creates a reader that parses a file once and serves the parsed value until the file changes.
 *
 * The rules look across module boundaries on every call they inspect, and a single util is imported
 * by hundreds of files, so without this every lint run would re-read and re-parse the same handful
 * of modules on each of them. Entries are checked against the file's mtime because the editor's
 * language server keeps the plugin loaded for its whole session: an edit there would otherwise go
 * unseen until a restart. The reader returns `undefined` for a file that cannot be read or parsed —
 * a module generated or deleted since, not an error.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function createFileCache<T>(parse: (source: string) => T): (file: string) => T | undefined {
    const entries = new Map<string, { mtimeMs: number; value: T }>();

    return read;

    function read(file: string): T | undefined {
        try {
            const { mtimeMs } = statSync(file);
            const cached = entries.get(file);
            if (cached?.mtimeMs === mtimeMs) {
                return cached.value;
            }

            const value = parse(readFileSync(file, 'utf8'));
            entries.set(file, { mtimeMs, value });

            return value;
        } catch {
            entries.delete(file);

            return undefined;
        }
    }
}
