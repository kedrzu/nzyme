/**
 * Creates a Basic Authentication header value from user credentials
 *
 * Formats the user and password as a base64-encoded string in the format
 * required for HTTP Basic Authentication.
 *
 * @param params - Object containing user and password
 * @param params.password - Password for authentication
 * @param params.user - Username or login
 * @returns Formatted Basic Auth header value ('Basic base64-encoded-credentials')
 */
export function getBasicAuthHeader(params: { password: string; user: string }): string {
    return `Basic ${Buffer.from(`${params.user}:${params.password}`).toString('base64')}`;
}
