import { LinearClient } from '@linear/sdk';

/**
 * How to authenticate against Linear. Linear tells the two apart by the header: a personal API key is
 * sent bare, an OAuth access token as `Bearer`, and neither is accepted the other way.
 */
export type LinearCredentials =
    | {
          /** A personal API key. */
          apiToken: string;
      }
    | {
          /** An OAuth access token, such as `defineLinearAuth`'s `get()` returns. */
          accessToken: string;
      };

/**
 * Create a Linear API client.
 * @__NO_SIDE_EFFECTS__
 */
export function createLinearClient(credentials: LinearCredentials): LinearClient {
    return 'accessToken' in credentials
        ? new LinearClient({ accessToken: credentials.accessToken })
        : new LinearClient({ apiKey: credentials.apiToken });
}

/**
 * The `Authorization` header value for the credentials: the bare personal key, or `Bearer` and the token.
 * @__NO_SIDE_EFFECTS__
 */
export function getLinearAuthorization(credentials: LinearCredentials): string {
    return 'accessToken' in credentials ? `Bearer ${credentials.accessToken}` : credentials.apiToken;
}
