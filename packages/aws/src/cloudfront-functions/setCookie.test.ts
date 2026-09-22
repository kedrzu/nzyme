import { expect, test } from 'bun:test';

import { setCookie } from './setCookie.js';
import type { CloudFrontResponse } from './types.js';

function response(): CloudFrontResponse {
    return { statusCode: 200, headers: {} };
}

test('sets a single cookie with the secure attributes', () => {
    const res = response();
    setCookie(res, { name: 'session', value: 'abc' });

    expect(res.cookies?.session?.value).toBe('abc');
    expect(res.cookies?.session?.attributes).toBe('Secure; HttpOnly; Path=/;');
});

test('carries a max age when one is given', () => {
    const res = response();
    setCookie(res, { name: 'session', value: 'abc', maxAge: 60 });

    expect(res.cookies?.session?.attributes).toBe('Secure; HttpOnly; Path=/; Max-Age=60;');
});

test('keeps the first cookie when a second of the same name is added', () => {
    // CloudFront applies `multiValue` alone when present, so a first value left behind in `value`
    // would never reach the viewer.
    const res = response();
    setCookie(res, { name: 'session', value: 'first' });
    setCookie(res, { name: 'session', value: 'second' });

    expect(res.cookies?.session?.multiValue?.map(entry => entry.value)).toEqual(['first', 'second']);
});
