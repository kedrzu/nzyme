const prefix = 'Basic ';

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
