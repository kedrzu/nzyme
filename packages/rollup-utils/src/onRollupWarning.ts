import { consola } from 'consola';
import type { WarningHandlerWithDefault } from 'rollup';

/**
 * Custom warning handler for Rollup that filters out common non-critical warnings.
 * This handler ignores:
 * - 'THIS_IS_UNDEFINED' warnings (common in class methods)
 * - Circular dependencies in third-party modules
 *
 * @param warning - The warning object from Rollup
 */
export const onRollupWarning: WarningHandlerWithDefault = warning => {
    // this warning we can safely ignore
    // https://stackoverflow.com/a/43556986/2202583
    if (warning.code === 'THIS_IS_UNDEFINED') {
        return;
    }

    // Ignore circular dependencies in third party modules
    if (
        warning.code === 'CIRCULAR_DEPENDENCY' &&
        warning.ids?.find(id => id.includes('node_modules/'))
    ) {
        return;
    }

    // console.warn everything else
    consola.warn(warning.message);
};
