import { CommandScope } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { resolveSecretTarget } from '@nzyme/secrets/resolveSecretTarget.js';
import { mergeStores, readStores } from '@nzyme/secrets/utils/readStores.js';

import type { GoogleAuthOptions } from './GoogleAuthOptions.js';
import type { GoogleClientProvider } from './GoogleClientProvider.js';
import { GoogleEndpoints } from './GoogleEndpoints.js';

/** What the sign-in functions of one command set work with. */
export interface GoogleAuthShape {
    /**
     * The raw value of the token secret; `undefined` when nothing is stored. Read from the merged view
     * of the provider's stores, as every secret is read (an environment variable of the same name does
     * not override it).
     */
    readTokens(): Promise<string | undefined>;
    /** Replaces the value of the token secret, in the store `resolveSecretTarget` picks. */
    writeTokens(value: string): Promise<void>;
    /**
     * Throws when `writeTokens` would be refused (a secret the provider does not declare or enable, a
     * store `target` refuses), without writing; sign-in calls it before the browser step.
     */
    assertTokensWritable(): void;
    /** The token secret's name, for messages. */
    secretName: string;
    clients: GoogleClientProvider;
    /** The `accounts` allowlist; unset allows every account. */
    allowed: string[] | undefined;
    endpoints: GoogleEndpoints;
}

/**
 * Defines the unit a Google command set resolves its auth through: the product's services from the
 * options arrive as its `deps`, so no command looks the provider up. Define it once per command set.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGoogleAuth(options: GoogleAuthOptions) {
    return defineService({
        name: 'GoogleAuth',
        // Per command, as the product's services may be.
        scope: CommandScope,
        deps: { provider: options.provider, clients: options.client, env: EnvVariables, endpoints: GoogleEndpoints },
        setup({ provider, clients, env, endpoints }): GoogleAuthShape {
            const secretName = options.tokens.name;
            return {
                readTokens,
                writeTokens,
                assertTokensWritable,
                secretName,
                clients,
                allowed: options.accounts,
                endpoints,
            };

            async function readTokens() {
                return mergeStores(await readStores(provider.stores)).get(secretName);
            }

            async function writeTokens(value: string) {
                await resolveTarget().write([{ key: secretName, value }]);
            }

            function assertTokensWritable() {
                resolveTarget();
            }

            function resolveTarget() {
                return resolveSecretTarget({ provider, env, name: secretName });
            }
        },
    });
}
