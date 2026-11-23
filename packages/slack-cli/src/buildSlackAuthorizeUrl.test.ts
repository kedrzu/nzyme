import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { buildSlackAuthorizeUrl } from './buildSlackAuthorizeUrl.js';
import { createSlackPkcePair } from './createSlackPkcePair.js';

// Slack rejects a `localhost` redirect without PKCE, and only S256 is supported — a URL missing
// either fails on Slack's consent page, not here.
test('asks for user scopes with an S256 PKCE challenge and the localhost redirect', () => {
    const pkce = createSlackPkcePair();
    const url = new URL(
        buildSlackAuthorizeUrl({
            clientId: 'client-1',
            userScopes: ['search:read', 'chat:write'],
            redirectUri: 'http://localhost:8760/callback',
            state: 'state-1',
            codeChallenge: pkce.challenge,
        }),
    );

    expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: 'client-1',
        user_scope: 'search:read,chat:write',
        redirect_uri: 'http://localhost:8760/callback',
        state: 'state-1',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
    });
});

test('derives the challenge as the URL-safe base64 SHA-256 of a fresh verifier', () => {
    const first = createSlackPkcePair();
    const second = createSlackPkcePair();

    expect(first.verifier).toMatch(/^[\w-]{43}$/);
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'));
    expect(second.verifier).not.toBe(first.verifier);
});
