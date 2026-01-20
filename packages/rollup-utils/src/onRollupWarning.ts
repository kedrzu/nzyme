import type { WarningHandlerWithDefault } from 'rollup';

/**
 * Options for the onRollupWarning function
 */
export interface OnRollupWarningOptions {
    /**
     * Ignore circular dependencies in third-party modules
     * @default 'node_modules'
     * @description Ignore circular dependencies in third-party modules
     */
    ignoreCircularDependencies?: 'all' | 'node_modules';
}

/**
 * Custom warning handler for Rollup that filters out common non-critical warnings.
 * This handler ignores:
 * - 'THIS_IS_UNDEFINED' warnings (common in class methods)
 * - Circular dependencies in third-party modules
 *
 * @param warning - The warning object from Rollup
 */
export function onRollupWarning(options: OnRollupWarningOptions = {}): WarningHandlerWithDefault {
    return warning => {
        // this warning we can safely ignore
        // https://stackoverflow.com/a/43556986/2202583
        if (warning.code === 'THIS_IS_UNDEFINED') {
            return;
        }

        // Ignore circular dependencies in third party modules
        if (warning.code === 'CIRCULAR_DEPENDENCY') {
            if (options.ignoreCircularDependencies === 'all') {
                return;
            }
            if (
                options.ignoreCircularDependencies === 'node_modules' &&
                warning.ids?.find(id => id.includes('node_modules/'))
            ) {
                return;
            }
            // Fall through to console.warn for circular dependencies not matching ignore rules
        }

        // console.warn everything else
        console.warn(warning.message);
    };
}
