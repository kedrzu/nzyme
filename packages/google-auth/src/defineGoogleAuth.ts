import { CommandScope } from '@nzyme/cli-core/Command.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { GoogleAuthOptions } from './GoogleAuthOptions.js';
import type { GoogleClientProvider } from './GoogleClientProvider.js';
import { GoogleEndpoints } from './GoogleEndpoints.js';

/** What the sign-in functions of one command set work with. */
export interface GoogleAuthShape {
    /**
     * The raw value of the token secret in the store; `undefined` when nothing is stored. An environment
     * variable of the same name does not override it.
     */
    readTokens(): Promise<string | undefined>;
    /** Replaces the value of the token secret in the store. */
    writeTokens(value: string): Promise<void>;
    /** The token secret's name, for messages. */
    secretName: string;
    clients: GoogleClientProvider;
    /** The `accounts` allowlist; unset allows every account. */
    allowed: string[] | undefined;
    endpoints: GoogleEndpoints;
}

/**
 * Defines the unit a Google command set resolves its auth through: the product's services from the
 * options arrive as its `deps`, so no command looks the store up. Define it once per command set.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGoogleAuth(options: GoogleAuthOptions) {
    return defineService({
        name: 'GoogleAuth',
        // Per command, as the product's services may be.
        scope: CommandScope,
        deps: { store: options.store, clients: options.client, endpoints: GoogleEndpoints },
        setup({ store, clients, endpoints }): GoogleAuthShape {
            const secretName = options.tokens.name;
            return {
                readTokens,
                writeTokens,
                secretName,
                clients,
                allowed: options.accounts,
                endpoints,
            };

            async function readTokens() {
                return (await store.readAll()).get(secretName);
            }

            async function writeTokens(value: string) {
                await store.write([{ key: secretName, value }]);
            }
        },
    });
}
