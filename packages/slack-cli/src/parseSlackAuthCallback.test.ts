import { expect, test } from 'bun:test';

import { parseSlackAuthCallback } from './parseSlackAuthCallback.js';

const STATE = 'state-Hq2Zx9';

test('returns the code of a callback carrying our state', () => {
    expect(callback(`code=abc&state=${STATE}`)).toEqual({ kind: 'code', code: 'abc' });
});

// The one security property here: a code arriving under someone else's state is never exchanged.
test('refuses a code arriving with another state, or none', () => {
    expect(callback('code=abc&state=other')).toEqual({ kind: 'foreign' });
    expect(callback('code=abc')).toEqual({ kind: 'foreign' });
});

test('reports a declined authorization', () => {
    expect(callback(`error=access_denied&state=${STATE}`)).toEqual({ kind: 'denied', error: 'access_denied' });
});

test('ignores requests to any other path', () => {
    const url = new URL(`http://localhost:8760/favicon.ico?state=${STATE}`);
    expect(parseSlackAuthCallback({ url, state: STATE, callbackPath: '/callback' })).toEqual({ kind: 'ignored' });
});

function callback(query: string) {
    return parseSlackAuthCallback({
        url: new URL(`http://localhost:8760/callback?${query}`),
        state: STATE,
        callbackPath: '/callback',
    });
}
