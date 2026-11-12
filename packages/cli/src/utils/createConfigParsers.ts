/**
 * Validators for a hand-rolled `nzyme.*` config read from `package.json`, all throwing the same
 * error, which names the config and the offending path: ``Invalid <label> config in package.json:
 * `<path>` must be <expected>.``
 *
 * @param label - The config named in the error, e.g. 'code index'.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function createConfigParsers(label: string) {
    return { parseArray, parseStringArray, parseString, configError };

    /** Validates an array, each item with `parseItem`. */
    function parseArray<T>(value: unknown, path: string, parseItem: (item: unknown, path: string) => T): T[] {
        if (!Array.isArray(value)) {
            throw configError(path, 'an array');
        }

        const items: T[] = [];
        for (const [index, item] of value.entries()) {
            items.push(parseItem(item, `${path}[${index}]`));
        }
        return items;
    }

    /** Validates an array of non-empty strings. */
    function parseStringArray(value: unknown, path: string): string[] {
        if (!Array.isArray(value)) {
            throw configError(path, 'an array of strings');
        }

        return parseArray(value, path, parseString);
    }

    /** Validates a non-empty string. */
    function parseString(value: unknown, path: string): string {
        if (typeof value !== 'string' || value === '') {
            throw configError(path, 'a non-empty string');
        }
        return value;
    }

    /** The error for a config value of the wrong shape. */
    function configError(path: string, expected: string): Error {
        return new Error(`Invalid ${label} config in package.json: \`${path}\` must be ${expected}.`);
    }
}
