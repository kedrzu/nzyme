import { expect, test } from 'bun:test';

import { createPkcePair } from '@nzyme/node-utils/createPkcePair.js';

import { buildSlackAuthorizeUrl } from './buildSlackAuthorizeUrl.js';

// Slack rejects a `localhost` redirect without PKCE, and only S256 is supported — a URL missing
// either fails on Slack's consent page, not here.
test('asks for user scopes with an S256 PKCE challenge and the localhost redirect', () => {
    const pkce = createPkcePair();
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
