import { CommandScope } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { GoogleAuthOptions } from './GoogleAuthOptions.js';
import type { GoogleClientProvider } from './GoogleClientProvider.js';
import { GoogleEndpoints } from './GoogleEndpoints.js';
import type { GoogleTokenStorage } from './GoogleTokenStorage.js';
import { secretTokenStorage } from './secretTokenStorage.js';

/** What the sign-in functions of one command set work with. */
export interface GoogleAuthShape {
    /** The token dictionary, in the declared token secret. */
    storage: GoogleTokenStorage;
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
            return {
                storage: secretTokenStorage({ provider, secret: options.tokens, env }),
                secretName: options.tokens.name,
                clients,
                allowed: options.accounts,
                endpoints,
            };
        },
    });
}
