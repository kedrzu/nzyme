import { parseBasicAuth } from './parseBasicAuth.js';
import { stringEqualTimingSafe } from './stringEqualsTimingSafe.js';

type BasicAuthParams = {
    login: string;
    password: string;
    token: string | null | undefined;
};

export function validateBasicAuth(params: BasicAuthParams) {
    const token = params.token;
    if (!token) {
        return false;
    }

    const parsed = parseBasicAuth(token);
    return (
        stringEqualTimingSafe(parsed.login, params.login) &&
        stringEqualTimingSafe(parsed.password, params.password)
    );
}
