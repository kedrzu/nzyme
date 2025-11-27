import chalk from 'chalk';

let i = 0;
const colors = [
    chalk.yellow,
    chalk.green,
    chalk.blue,
    chalk.magenta,
    chalk.cyan,
    chalk.blueBright,
    chalk.greenBright,
    chalk.yellowBright,
];

// To make sure that for the same name, the same color is used
const prefixCache = new Map<string, string>();

/**
 * Gets a colored prefix for a logger name. Assigns colors cyclically and caches results.
 *
 * @param name - The logger name to create a prefix for
 * @returns A colored prefix string in the format `[name] `, or empty string if no name provided
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getPrettyPrefix(name: string | undefined): string {
    if (!name) {
        return '';
    }

    if (prefixCache.has(name)) {
        return prefixCache.get(name)!;
    }

    const color = colors[i++ % colors.length]!;
    const prefix = color(`[${name}] `);
    prefixCache.set(name, prefix);
    return prefix;
}
