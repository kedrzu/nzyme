const regex = /{\s*(\w*)\s*}/gi;

/**
 * Formats a string template by replacing placeholders with corresponding values from a parameters object.
 * Placeholders are in the format {key}, where key is a property name in the parameters object.
 * @util
 *
 * @param template - The string template containing placeholders
 * @param params - An object containing values to replace placeholders with
 * @returns The formatted string with placeholders replaced by their corresponding values
 *
 * @example
 * ```ts
 * formatWith('Hello {name}!', { name: 'World' }) // returns 'Hello World!'
 * formatWith('Product price: {price}', { price: 99.99 }) // returns 'Product price: 99.99'
 * ```
 */
export function formatWith(template: string, params: Record<string, unknown>) {
    return template.replace(regex, (match, key: string) => {
        const value = params[key];
        if (value !== undefined) {
            return String(params[key]);
        }

        return match;
    });
}
