import chalk from 'chalk';
import type { ChalkInstance } from 'chalk';

import { assert } from '@nzyme/utils/assert.js';

const COLORS: readonly ChalkInstance[] = [
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
const prefixFor = createPrefixRegistry();

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

    return prefixFor(name);
}

/**
 * Creates the registry that gives each new name the next color in `COLORS`, and the same prefix
 * on every later call with that name.
 *
 * @__NO_SIDE_EFFECTS__
 */
function createPrefixRegistry(): (name: string) => string {
    const prefixes = new Map<string, string>();

    return name => {
        let prefix = prefixes.get(name);
        if (prefix === undefined) {
            const color = COLORS[prefixes.size % COLORS.length];
            assert(color);
            prefix = color(`[${name}] `);
            prefixes.set(name, prefix);
        }

        return prefix;
    };
}
