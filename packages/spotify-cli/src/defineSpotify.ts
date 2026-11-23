import { CommandScope } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { resolveSecretTarget } from '@nzyme/secrets/resolveSecretTarget.js';
import { mergeStores, readStores } from '@nzyme/secrets/utils/readStores.js';

import type { SpotifyApi } from './createSpotifyApi.js';
import { createSpotifyApi } from './createSpotifyApi.js';
import { refreshSpotifyToken } from './refreshSpotifyToken.js';
import { SpotifyEndpoints } from './SpotifyEndpoints.js';
import type { SpotifyOptions } from './SpotifyOptions.js';
import type { SpotifyToken } from './spotifyToken.js';
import { parseSpotifyToken } from './spotifyToken.js';

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const ACCOUNTS_URL = 'https://accounts.spotify.com';
const API_URL = 'https://api.spotify.com/v1';

/** What a call that may need a new sign-in names in its error. */
export interface SpotifySignInParams {
    /**
     * The CLI command signing in (`nzyme spotify auth`), named in a sign-in-again error. A program
     * outside a CLI leaves it out and gets a generic pointer.
     */
    signInCommand?: string;
}

/** The signed-in Spotify account of one command run (one `CommandScope`). */
export interface SpotifyShape {
    /**
     * The typed Web API client with a fresh access token. The first call of the scope refreshes the
     * token (and stores a rotated refresh token); later calls reuse it, whatever their params.
     * Throws the sign-in-again `UsageError` when no usable token is stored or Spotify rejects it.
     */
    getApi(params?: SpotifySignInParams): Promise<SpotifyApi>;
    /** The access token behind `getApi`, from the same single refresh. Never print it. */
    getAccessToken(params?: SpotifySignInParams): Promise<string>;
    /**
     * The stored token. Throws the sign-in-again `UsageError` when there is none or it is malformed.
     * Read from the merged view of the provider's stores, as every secret is read.
     */
    readToken(params?: SpotifySignInParams): Promise<SpotifyToken>;
    /** Replaces the token secret's value, in the store `resolveSecretTarget` picks. */
    writeToken(token: SpotifyToken): Promise<void>;
    /**
     * Throws when `writeToken` would be refused (a secret the provider does not declare or enable, a
     * store `target` refuses), without writing; sign-in calls it before the browser step.
     */
    assertTokenWritable(): void;
    /** The Client ID of the project's Spotify app. */
    clientId: string;
    /** Where Spotify is reached, defaults applied. */
    endpoints: Required<SpotifyEndpoints>;
    /** The redirect URI sign-in listens on; it must match the one registered on the app. */
    redirectUri: string;
    /** The token secret's name, for messages. */
    secretName: string;
}

/** An access token and the client using it, refreshed once per scope. */
interface SpotifySession {
    accessToken: string;
    api: SpotifyApi;
}

/**
 * Defines the unit a Spotify command set (or a program) reaches the account through: the product's
 * services from the options arrive as its `deps`. Define it once per command set. It lives per command
 * (`CommandScope`): a program outside a CLI resolves it in `container.createChild(CommandScope)`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSpotify(options: SpotifyOptions) {
    return defineService({
        name: 'Spotify',
        // Per command, as the product's services may be, and so each run refreshes once.
        scope: CommandScope,
        deps: {
            provider: options.provider,
            clientId: options.clientId,
            env: EnvVariables,
            endpoints: SpotifyEndpoints,
        },
        setup({ provider, clientId, env, endpoints }): SpotifyShape {
            const secretName = options.token.name;
            const resolved = {
                accountsUrl: endpoints.accountsUrl ?? ACCOUNTS_URL,
                apiUrl: endpoints.apiUrl ?? API_URL,
            };
            let session: Promise<SpotifySession> | undefined;

            return {
                getApi,
                getAccessToken,
                readToken,
                writeToken,
                assertTokenWritable,
                clientId,
                endpoints: resolved,
                redirectUri: options.redirectUri ?? DEFAULT_REDIRECT_URI,
                secretName,
            };

            async function getApi(params?: SpotifySignInParams) {
                return (await getSession(params)).api;
            }

            async function getAccessToken(params?: SpotifySignInParams) {
                return (await getSession(params)).accessToken;
            }

            function getSession(params: SpotifySignInParams | undefined) {
                session ??= openSession(params?.signInCommand);
                return session;
            }

            async function openSession(signInCommand: string | undefined): Promise<SpotifySession> {
                const token = await readToken({ signInCommand });
                const granted = await refreshSpotifyToken({
                    accountsUrl: resolved.accountsUrl,
                    clientId,
                    refreshToken: token.refreshToken,
                    signInCommand,
                });
                if (granted.refreshToken && granted.refreshToken !== token.refreshToken) {
                    // Spotify rotated it: the stored one may stop working.
                    await writeToken({ ...token, refreshToken: granted.refreshToken });
                }

                const { accessToken } = granted;
                return { accessToken, api: createSpotifyApi({ apiUrl: resolved.apiUrl, accessToken, signInCommand }) };
            }

            async function readToken(params?: SpotifySignInParams) {
                const value = mergeStores(await readStores(provider.stores)).get(secretName);
                return parseSpotifyToken({ value, secretName, signInCommand: params?.signInCommand });
            }

            async function writeToken({ refreshToken, scopes, userId, signedInAt }: SpotifyToken) {
                const value = JSON.stringify({ refreshToken, scopes, userId, signedInAt });
                await resolveTarget().write([{ key: secretName, value }]);
            }

            function assertTokenWritable() {
                resolveTarget();
            }

            function resolveTarget() {
                return resolveSecretTarget({ provider, env, name: secretName });
            }
        },
    });
}
