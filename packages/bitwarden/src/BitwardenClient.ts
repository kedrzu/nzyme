import { Buffer } from 'node:buffer';

import { createOpenApiFetch } from '@nzyme/openapi/openapi-fetch.js';

import type {
    BitwardenApiPaths,
    BitwardenSecret,
    BitwardenSecretCreateRequest,
    BitwardenSecretSummary,
    BitwardenSecretUpdateRequest,
} from './bitwardenApi.js';
import type { BitwardenKey } from './bitwardenCrypto.js';
import { decryptOrganizationKey, parseBitwardenAccessToken } from './bitwardenCrypto.js';

/**
 * Where a Bitwarden server's identity service (login) and API live.
 */
export interface BitwardenServerUrls {
    identity: string;
    api: string;
}

/**
 * A logged-in Secrets Manager session. Keys, values and notes in and out are EncStrings under
 * `organizationKey`; the client does no secret crypto itself.
 */
export interface BitwardenClient {
    organizationKey: BitwardenKey;
    /** The project's secrets, without values or notes. */
    listProjectSecrets(projectId: string): Promise<BitwardenSecretSummary[]>;
    /** The given secrets with values and notes; fails if any of them no longer exists. */
    getSecrets(ids: string[]): Promise<BitwardenSecret[]>;
    /** Creates the secret in the access token's organization. */
    createSecret(request: BitwardenSecretCreateRequest): Promise<void>;
    updateSecret(id: string, request: BitwardenSecretUpdateRequest): Promise<void>;
}

/**
 * Logs in to Bitwarden Secrets Manager with a machine account access token (OAuth client
 * credentials, scope `api.secrets`), decrypts the organization key from the login response and
 * returns a client for the API. No error carries the token, a response body or a secret.
 */
export async function loginBitwarden(urls: BitwardenServerUrls, accessToken: string): Promise<BitwardenClient> {
    const { clientId, clientSecret, tokenKey } = await parseBitwardenAccessToken(accessToken);
    const identityHost = new URL(urls.identity).host;
    const response = await fetchFrom(identityHost)(`${urls.identity}/connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'api.secrets',
            client_id: clientId,
            client_secret: clientSecret,
        }),
        redirect: 'manual',
    });

    if (response.status === 400 || response.status === 401) {
        throw new Error(
            `Bitwarden at ${identityHost} rejected the access token: run \`secrets login\` (\`secrets login --write\` for the write token) with a valid one`,
        );
    }

    if (!response.ok) {
        throw new Error(`Bitwarden login at ${identityHost} failed with HTTP ${response.status}`);
    }

    const login = readLoginResponse(await response.text());
    const organizationId = readOrganizationId(login.accessToken);
    const organizationKey = await decryptOrganizationKey(login.encryptedPayload, tokenKey);
    const api = createOpenApiFetch<BitwardenApiPaths>({
        baseUrl: urls.api,
        headers: { authorization: `Bearer ${login.accessToken}`, accept: 'application/json' },
        fetch: fetchFrom(new URL(urls.api).host),
    });

    return {
        organizationKey,
        listProjectSecrets,
        getSecrets,
        createSecret,
        updateSecret,
    };

    async function listProjectSecrets(projectId: string) {
        const result = await api({ method: 'GET', path: '/projects/{projectId}/secrets', pathParams: { projectId } });
        const { status } = result.response;
        if (result.status === 200) {
            return result.data.secrets ?? [];
        }

        if (status === 404) {
            throw new Error(`Bitwarden project ${projectId} does not exist or this access token cannot read it`);
        }

        throw requestFailed(status, `list of project ${projectId}`);
    }

    async function getSecrets(ids: string[]) {
        const result = await api({
            method: 'POST',
            path: '/secrets/get-by-ids',
            contentType: 'application/json',
            body: { ids },
        });
        const { status } = result.response;
        const secrets = result.status === 200 ? (result.data.data ?? []) : null;
        if (result.status === 404 || (secrets != null && secrets.length !== ids.length)) {
            throw new Error('A Bitwarden secret was deleted while it was being read: try again');
        }

        if (secrets == null) {
            throw requestFailed(status, 'secrets fetch');
        }

        return secrets;
    }

    async function createSecret(request: BitwardenSecretCreateRequest) {
        const result = await api({
            method: 'POST',
            path: '/organizations/{organizationId}/secrets',
            pathParams: { organizationId },
            contentType: 'application/json',
            body: request,
        });
        if (result.response.status !== 200) {
            throw requestFailed(result.response.status, 'secret create');
        }
    }

    async function updateSecret(id: string, request: BitwardenSecretUpdateRequest) {
        const result = await api({
            method: 'PUT',
            path: '/secrets/{id}',
            pathParams: { id },
            contentType: 'application/json',
            body: request,
        });
        if (result.response.status !== 200) {
            throw requestFailed(result.response.status, `update of secret ${id}`);
        }
    }
}

/**
 * `fetch` that turns a failure to connect into an error naming the host, so it reads apart from an
 * HTTP error. The network error it chains carries the URL, which holds ids only.
 */
function fetchFrom(host: string) {
    return async function fetchBitwarden(input: string | Request | URL, init?: RequestInit) {
        try {
            return await fetch(input, init);
        } catch (error) {
            throw new Error(`Cannot reach Bitwarden at ${host}: check the server and the network`, { cause: error });
        }
    };
}

function requestFailed(status: number, operation: string) {
    switch (status) {
        case 401:
        case 403:
            return new Error(`Bitwarden refused the ${operation}: the access token lacks access`);
        default:
            return new Error(`Bitwarden ${operation} failed with HTTP ${status}`);
    }
}

function readLoginResponse(text: string) {
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        // Not chained: a parse error can quote the response, which holds a session token.
        body = null;
    }

    if (
        typeof body !== 'object' ||
        body === null ||
        !('access_token' in body) ||
        !('encrypted_payload' in body) ||
        typeof body.access_token !== 'string' ||
        typeof body.encrypted_payload !== 'string'
    ) {
        throw new Error('Bitwarden login response has no access_token or encrypted_payload');
    }

    return { accessToken: body.access_token, encryptedPayload: body.encrypted_payload };
}

/** Reads the `organization` claim from the payload of the session JWT (its signature is the server's concern). */
function readOrganizationId(jwt: string) {
    const payload = jwt.split('.')[1];
    let claims: unknown;
    try {
        claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));
    } catch {
        claims = null;
    }

    if (typeof claims !== 'object' || claims === null || !('organization' in claims)) {
        throw new Error('Bitwarden session token has no organization claim');
    }

    const { organization } = claims;
    if (typeof organization !== 'string' || organization === '') {
        throw new Error('Bitwarden session token has no organization claim');
    }

    return organization;
}
