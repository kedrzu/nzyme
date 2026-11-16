import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

/** Arguments of {@link requestLinearGraphql}. */
export interface RequestLinearGraphqlParams {
    /** A personal API key, sent as the bare `Authorization` header Linear expects for one. */
    token: string;
    query: string;
    variables?: Record<string, unknown>;
}

/** What Linear answered, before anyone decides whether it counts as success. */
export interface LinearGraphqlResponse {
    status: number;
    ok: boolean;
    /** False when the body was not JSON at all. */
    isJson: boolean;
    /** The response's `data`, `undefined` when absent. */
    data: unknown;
    /** The GraphQL error messages, empty when there were none. */
    errors: string[];
}

/**
 * Sends one GraphQL document to the Linear API. Rejects only when the request itself fails (network,
 * DNS); an HTTP error or GraphQL errors come back in the response, because callers treat partial
 * data differently.
 */
export async function requestLinearGraphql(params: RequestLinearGraphqlParams): Promise<LinearGraphqlResponse> {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: params.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: params.query, variables: params.variables }),
    });

    const body = await readJson(response);
    return {
        status: response.status,
        ok: response.ok,
        isJson: body !== undefined,
        data: isPlainObject(body) ? body.data : undefined,
        errors: readErrorMessages(body),
    };
}

/** The parsed JSON body, or `undefined` when the body is not JSON. */
async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}

function readErrorMessages(body: unknown): string[] {
    if (!isPlainObject(body) || !Array.isArray(body.errors)) {
        return [];
    }

    return body.errors.map(error =>
        isPlainObject(error) && typeof error.message === 'string' ? error.message : 'Unknown GraphQL error',
    );
}
