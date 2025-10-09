const prefix = 'Basic ';

/**
 * Parses a Basic Authentication token into login and password components
 *
 * Takes a Basic Auth token (either with or without the 'Basic ' prefix) and
 * decodes the base64-encoded credentials, splitting them into login and password.
 *
 * @param token - The Basic Auth token string from an Authorization header
 * @returns Object containing the extracted login and password
 */
export function parseBasicAuth(token: string) {
    token = token.trim();

    if (token.startsWith(prefix)) {
        token = token.substring(prefix.length).trim();
    }

    const [login, password] = Buffer.from(token, 'base64').toString().split(':');

    return {
        login: login ?? '',
        password: password ?? '',
    };
}
