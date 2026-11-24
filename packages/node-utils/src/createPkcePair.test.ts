import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { createPkcePair } from './createPkcePair.js';

test('derives the challenge as the URL-safe base64 SHA-256 of a fresh verifier', () => {
    const first = createPkcePair();
    const second = createPkcePair();

    expect(first.verifier).toMatch(/^[\w-]{43}$/);
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'));
    expect(second.verifier).not.toBe(first.verifier);
});
