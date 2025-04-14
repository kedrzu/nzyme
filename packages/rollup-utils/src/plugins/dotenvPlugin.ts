import type { Plugin } from 'rollup';

/**
 * Creates a Rollup plugin that generates a .env file from the provided environment variables.
 * This plugin is useful for bundling applications that need environment variables at runtime.
 *
 * @param vars - An object containing environment variables to include in the .env file
 * @returns A Rollup plugin that generates a .env file during the build process
 *
 * @example
 * ```typescript
 * // In your Rollup config:
 * plugins: [
 *   dotenvPlugin({
 *     NODE_ENV: 'production',
 *     API_URL: 'https://api.example.com'
 *   })
 * ]
 * ```
 */
export function dotenvPlugin(vars: Record<string, boolean | number | string>): Plugin {
    return {
        name: 'dotenv',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: '.env',
                source: Object.entries(vars)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('\n'),
            });
        },
    };
}
