import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import type { ConfigSource } from './ConfigSource.js';

/**
 * Source of the string-valued entries of the environment (default `process.env`), for runtimes with
 * no document on disk: the browser, which reads the variables Nuxt bakes into `runtimeConfig.public`,
 * and build-time processes.
 *
 * Only string-valued keys can travel this way; structured keys belong in a file or a secret store.
 */
export function envSource(env: EnvVariables = process.env): ConfigSource {
    return {
        name: 'env',
        load() {
            const entries: Record<string, string> = {};

            for (const [key, value] of Object.entries(env)) {
                if (value !== undefined) {
                    entries[key] = value;
                }
            }

            return entries;
        },
    };
}
