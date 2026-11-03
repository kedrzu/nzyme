import { Buffer } from 'node:buffer';

import { expect, test } from 'bun:test';

import {
    decryptEncString,
    decryptOrganizationKey,
    encryptEncString,
    parseBitwardenAccessToken,
} from './bitwardenCrypto.js';

// An independent vector, made by a one-off Node script and no code of ours: a random fake access
// token, its token key derived with node:crypto `hkdfSync` (salt "bitwarden-accesstoken", info
// "sm-access-token"), a random organization key, and both EncStrings built with
// `createCipheriv('aes-256-cbc')` + `createHmac('sha256')`. The script then had the varlock
// Bitwarden plugin (@varlock/bitwarden-plugin 2.0.2, `deriveKeyFromAccessToken` and
// `decryptAes256CbcHmac`) derive the key itself and decrypt both layers to the same values.
const VECTOR_ACCESS_TOKEN = '0.3ed10981-f55b-48a0-864e-e125fbf9debd.fakeClientSecret:90pltmDWhKgtKOsiwr4lwQ==';
const VECTOR_ENCRYPTED_PAYLOAD =
    '2.qcX8kBD2BqeJGb0733AnZw==|iNtSBHu5a4zy81q2aRuTW1Ad7Gc4XUnuwHMdKuG9QXZ78y353hiF4LGBm4LV+fwnu8ge6h6AQvBu8N392QQjpYFpSzS/fEU4WziFuIlFa7kUbCHd9vns6550N6QZgYc9vypndvQ533xuYskwZnEO8w==|EGk0RtHpfmX6ujQqCLFLM2P1h/0jQS6GRriDcWvPv7s=';
const VECTOR_ENCRYPTED_SECRET =
    '2.axxzwM6M52rwrO8XSwrwRg==|vRzOf78N/WhNnmTP5myLcZZa6DadgLw7iNG8KIB+hzxQWE7gx8aKYyIWcFReMG8/|Cm/6FP1gsUkRCjEWQEkQa8jZZlRZqIrL+0S2YKBVvIA=';
const VECTOR_SECRET_VALUE = 'zażółć gęślą jaźń: s3cr3t';
const VECTOR_TOKEN_SEED = '90pltmDWhKgtKOsiwr4lwQ==';

test('decrypts a vector from an independent implementation', async () => {
    const token = await parseBitwardenAccessToken(VECTOR_ACCESS_TOKEN);
    const organizationKey = await decryptOrganizationKey(VECTOR_ENCRYPTED_PAYLOAD, token.tokenKey);

    expect(token.clientId).toBe('3ed10981-f55b-48a0-864e-e125fbf9debd');
    expect(token.clientSecret).toBe('fakeClientSecret');
    expect(await decryptEncString(VECTOR_ENCRYPTED_SECRET, organizationKey)).toBe(VECTOR_SECRET_VALUE);
});

test('round-trips through encrypt and decrypt with a fresh IV each time', async () => {
    const { tokenKey } = await parseBitwardenAccessToken(VECTOR_ACCESS_TOKEN);

    const first = await encryptEncString(VECTOR_SECRET_VALUE, tokenKey);
    const second = await encryptEncString(VECTOR_SECRET_VALUE, tokenKey);

    expect(await decryptEncString(first, tokenKey)).toBe(VECTOR_SECRET_VALUE);
    expect(await decryptEncString(second, tokenKey)).toBe(VECTOR_SECRET_VALUE);
    expect(first.split('|')[0]).not.toBe(second.split('|')[0]);
});

test.each([0, 1, 2])('rejects a tampered EncString part %i before decrypting it', async part => {
    const organizationKey = await vectorOrganizationKey();
    const tampered = tamper(VECTOR_ENCRYPTED_SECRET, part);

    const error = await catchError(decryptEncString(tampered, organizationKey));

    expect(error.message).toBe('EncString MAC does not match: wrong key or tampered data');
    expectNoSecrets(error, tampered);
});

test('rejects an EncString under another key', async () => {
    const { tokenKey } = await parseBitwardenAccessToken(VECTOR_ACCESS_TOKEN);

    const error = await catchError(decryptEncString(VECTOR_ENCRYPTED_SECRET, tokenKey));

    expect(error.message).toBe('EncString MAC does not match: wrong key or tampered data');
});

test.each([
    ['no type', 'qcX8kBD2BqeJGb0733AnZw==|AAAAAAAAAAAAAAAAAAAAAA==|AAAA', /missing the type/],
    ['another type', VECTOR_ENCRYPTED_SECRET.replace(/^2\./, '0.'), /type is not supported/],
    ['a missing part', VECTOR_ENCRYPTED_SECRET.slice(0, VECTOR_ENCRYPTED_SECRET.lastIndexOf('|')), /malformed/],
    ['invalid base64', VECTOR_ENCRYPTED_SECRET.replace('|', '$|'), /IV is not valid base64/],
    ['a short IV', VECTOR_ENCRYPTED_SECRET.replace(/^2\.[^|]+/, '2.AAAA'), /IV must be 16 bytes/],
    ['a partial block', VECTOR_ENCRYPTED_SECRET.replace(/\|[^|]+\|/, '|AAAA|'), /multiple of 16/],
    ['a short MAC', VECTOR_ENCRYPTED_SECRET.replace(/\|[^|]+$/, '|AAAA'), /MAC must be 32 bytes/],
])('rejects an EncString with %s', async (_, encString, message) => {
    const organizationKey = await vectorOrganizationKey();

    const error = await catchError(decryptEncString(encString, organizationKey));

    expect(error.message).toMatch(message);
    expectNoSecrets(error, encString);
});

test('rejects a login payload that is not the expected JSON without quoting it', async () => {
    const { tokenKey } = await parseBitwardenAccessToken(VECTOR_ACCESS_TOKEN);
    const payload = await encryptEncString(`{"encryptionKey": ${VECTOR_SECRET_VALUE}}`, tokenKey);

    const error = await catchError(decryptOrganizationKey(payload, tokenKey));

    expect(error.message).toBe('Bitwarden login payload has no valid encryptionKey');
    expectNoSecrets(error, payload);
});

test.each([
    ['another version', VECTOR_ACCESS_TOKEN.replace(/^0\./, '1.'), /malformed/],
    ['no key', VECTOR_ACCESS_TOKEN.split(':')[0]!, /malformed/],
    ['a short key', VECTOR_ACCESS_TOKEN.replace(/:.*$/, ':AAAA'), /must be 16 bytes/],
])('rejects an access token with %s without quoting it', async (_, token, message) => {
    const error = await catchError(parseBitwardenAccessToken(token));

    expect(error.message).toMatch(message);
    expectNoSecrets(error, token);
});

async function vectorOrganizationKey() {
    const { tokenKey } = await parseBitwardenAccessToken(VECTOR_ACCESS_TOKEN);
    return await decryptOrganizationKey(VECTOR_ENCRYPTED_PAYLOAD, tokenKey);
}

/** Flips one bit in the first byte of the given part (0 = IV, 1 = ciphertext, 2 = MAC). */
function tamper(encString: string, part: number) {
    const parts = encString.slice(2).split('|');
    const bytes = Buffer.from(parts[part]!, 'base64');
    bytes[0]! ^= 1;
    parts[part] = bytes.toString('base64');
    return `2.${parts.join('|')}`;
}

async function catchError(promise: Promise<unknown>) {
    const rejection = await promise.then(
        () => null,
        (reason: unknown) => reason,
    );
    if (!(rejection instanceof Error)) {
        throw new TypeError('Expected the promise to reject with an Error');
    }

    return rejection;
}

/** A chained cause could quote the input (a JSON parse error does), so none is allowed. */
function expectNoSecrets(error: Error, input: string) {
    expect(error.cause).toBeUndefined();
    for (const secret of [input, VECTOR_TOKEN_SEED, VECTOR_SECRET_VALUE, 'fakeClientSecret']) {
        expect(error.message).not.toContain(secret);
    }
}
