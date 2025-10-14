/**
 * Creates a mapping of environment variables for Rollup's define plugin.
 * This function takes an object of constants and converts them into a format
 * that can be used with Rollup's define plugin to replace process.env variables
 * at build time.
 *
 * @typeParam T - The type of the constants object, must be a record of string keys and string values
 * @param constants - An object containing environment variables to define
 * @returns A record of process.env variables mapped to their stringified values
 *
 * @example
 * ```typescript
 * const defines = constantsToDefine({
 *   NODE_ENV: 'development',
 *   API_URL: 'http://localhost:3000'
 * });
 * // Result: {
 * //   'process.env.NODE_ENV': '"development"',
 * //   'process.env.API_URL': '"http://localhost:3000"'
 * // }
 * ```
 */
export function constantsToDefine<T extends object = Record<string, unknown>>(constants: T) {
    const result: Record<string, string> = {};

    for (const key in constants) {
        const value = constants[key as keyof T];
        result[`process.env.${key}`] = JSON.stringify(String(value));
    }

    return result;
}
