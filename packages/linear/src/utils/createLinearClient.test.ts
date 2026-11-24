import { afterEach, expect, test } from 'bun:test';

import { createLinearClient } from './createLinearClient.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// Linear takes a personal key only bare and an OAuth token only as `Bearer`: the wrong form is a 401.
test.each([
    ['a personal API key bare', { apiToken: 'lin_api_key-sentinel' }, 'lin_api_key-sentinel'],
    ['an OAuth access token as Bearer', { accessToken: 'lin_oauth-sentinel' }, 'Bearer lin_oauth-sentinel'],
])('the SDK client sends %s', async (_, credentials, expected) => {
    const authorizations: (string | null)[] = [];
    globalThis.fetch = Object.assign(
        (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            authorizations.push(
                new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get(
                    'authorization',
                ),
            );
            return Promise.resolve(Response.json({ data: { viewer: { id: 'u1', name: 'Ada' } } }));
        },
        { preconnect: originalFetch.preconnect },
    );

    await createLinearClient(credentials).viewer;

    expect(authorizations).toEqual([expected]);
});
