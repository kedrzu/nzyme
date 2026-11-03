import { Buffer } from 'node:buffer';

/**
 * A 64-byte Bitwarden symmetric key, split as Bitwarden splits it: the first 32 bytes are the
 * AES-256-CBC key, the last 32 the HMAC-SHA256 key. Both halves are non-extractable.
 */
export interface BitwardenKey {
    encryptionKey: CryptoKey;
    macKey: CryptoKey;
}

/**
 * A parsed Bitwarden Secrets Manager access token. The client id and secret log in to the identity
 * server; `tokenKey` decrypts the login response's `encrypted_payload`.
 */
export interface BitwardenAccessToken {
    clientId: string;
    clientSecret: string;
    tokenKey: BitwardenKey;
}

const ENC_STRING_TYPE = '2';
const IV_LENGTH = 16;
const MAC_LENGTH = 32;
const AES_BLOCK_LENGTH = 16;
const KEY_LENGTH = 64;
const TOKEN_SEED_LENGTH = 16;

/**
 * Parses an access token `0.<clientId>.<clientSecret>:<seed>`, where `seed` is 16 bytes in base64,
 * and derives the token key from the seed:
 * `prk = HMAC-SHA256(key = "bitwarden-accesstoken", data = seed)`, then
 * `HKDF-Expand(prk, info = "sm-access-token", L = 64)` split into a {@link BitwardenKey}
 * (together, HKDF-SHA256 with salt `"bitwarden-accesstoken"`).
 * Errors never include the token.
 */
export async function parseBitwardenAccessToken(token: string): Promise<BitwardenAccessToken> {
    const [credentials, seedBase64, ...rest] = token.split(':');
    const [version, clientId, clientSecret, ...restCredentials] = credentials?.split('.') ?? [];
    if (
        rest.length > 0 ||
        restCredentials.length > 0 ||
        version !== '0' ||
        !clientId ||
        !clientSecret ||
        seedBase64 == null
    ) {
        throw new Error('Bitwarden access token is malformed: expected 0.<clientId>.<clientSecret>:<key>');
    }

    const seed = decodeBase64(seedBase64, 'access token key');
    if (seed.length !== TOKEN_SEED_LENGTH) {
        throw new Error(`Bitwarden access token key must be ${TOKEN_SEED_LENGTH} bytes`);
    }

    // HKDF-Extract(salt, ikm) is HMAC(key = salt, data = ikm), so Bitwarden's HMAC step is
    // exactly WebCrypto HKDF's Extract with the "bitwarden-accesstoken" salt.
    const seedKey = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits']);
    const okm = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: utf8('bitwarden-accesstoken'), info: utf8('sm-access-token') },
        seedKey,
        KEY_LENGTH * 8,
    );
    return { clientId, clientSecret, tokenKey: await importBitwardenKey(new Uint8Array(okm)) };
}

/**
 * Decrypts the identity login response's `encrypted_payload` with the token key. Its plaintext is
 * JSON `{"encryptionKey": "<base64 of 64 bytes>"}`: the organization key, under which secrets'
 * keys, values and notes are encrypted.
 */
export async function decryptOrganizationKey(encryptedPayload: string, tokenKey: BitwardenKey): Promise<BitwardenKey> {
    const payload = await decryptEncString(encryptedPayload, tokenKey);
    const encryptionKey = readEncryptionKey(payload);
    if (encryptionKey == null) {
        // The parse error is not chained: its message can quote the plaintext.
        throw new Error('Bitwarden login payload has no valid encryptionKey');
    }

    const raw = decodeBase64(encryptionKey, 'organization key');
    if (raw.length !== KEY_LENGTH) {
        throw new Error(`Bitwarden organization key must be ${KEY_LENGTH} bytes`);
    }

    return await importBitwardenKey(raw);
}

/**
 * Decrypts an EncString of type 2, `2.<iv>|<ciphertext>|<mac>` (each part base64):
 * AES-256-CBC with PKCS#7 padding, authenticated by `mac = HMAC-SHA256(macKey, iv ‖ ciphertext)`.
 * The MAC is checked in constant time before anything is decrypted. Other types are rejected.
 * Errors never include the input, the key or the plaintext.
 */
export async function decryptEncString(encString: string, key: BitwardenKey): Promise<string> {
    const typeSeparator = encString.indexOf('.');
    if (typeSeparator < 0) {
        throw new Error('EncString is malformed: missing the type prefix');
    }

    if (encString.slice(0, typeSeparator) !== ENC_STRING_TYPE) {
        throw new Error(`EncString type is not supported: only type ${ENC_STRING_TYPE} is`);
    }

    const parts = encString.slice(typeSeparator + 1).split('|');
    const [ivBase64, ciphertextBase64, macBase64] = parts;
    if (parts.length !== 3 || ivBase64 == null || ciphertextBase64 == null || macBase64 == null) {
        throw new Error('EncString is malformed: expected <iv>|<ciphertext>|<mac>');
    }

    const iv = decodeBase64(ivBase64, 'EncString IV');
    const ciphertext = decodeBase64(ciphertextBase64, 'EncString ciphertext');
    const mac = decodeBase64(macBase64, 'EncString MAC');
    if (iv.length !== IV_LENGTH) {
        throw new Error(`EncString IV must be ${IV_LENGTH} bytes`);
    }

    if (ciphertext.length === 0 || ciphertext.length % AES_BLOCK_LENGTH !== 0) {
        throw new Error(`EncString ciphertext must be a non-empty multiple of ${AES_BLOCK_LENGTH} bytes`);
    }

    if (mac.length !== MAC_LENGTH) {
        throw new Error(`EncString MAC must be ${MAC_LENGTH} bytes`);
    }

    const authentic = await crypto.subtle.verify('HMAC', key.macKey, mac, concat(iv, ciphertext));
    if (!authentic) {
        throw new Error('EncString MAC does not match: wrong key or tampered data');
    }

    let plaintext: ArrayBuffer;
    try {
        plaintext = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key.encryptionKey, ciphertext);
    } catch {
        throw new Error('EncString could not be decrypted: wrong key');
    }

    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    } catch {
        throw new Error('EncString plaintext is not valid UTF-8');
    }
}

/**
 * Encrypts `plaintext` into an EncString of type 2 (see {@link decryptEncString}), with a fresh
 * random IV on every call.
 */
export async function encryptEncString(plaintext: string, key: BitwardenKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key.encryptionKey, utf8(plaintext)),
    );
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key.macKey, concat(iv, ciphertext)));
    return `${ENC_STRING_TYPE}.${encodeBase64(iv)}|${encodeBase64(ciphertext)}|${encodeBase64(mac)}`;
}

/** Imports 64 raw key bytes as an AES-256 key (first half) and an HMAC-SHA256 key (second half). */
async function importBitwardenKey(raw: Uint8Array<ArrayBuffer>): Promise<BitwardenKey> {
    const [encryptionKey, macKey] = await Promise.all([
        crypto.subtle.importKey('raw', raw.subarray(0, 32), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']),
        crypto.subtle.importKey('raw', raw.subarray(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, [
            'sign',
            'verify',
        ]),
    ]);
    return { encryptionKey, macKey };
}

function readEncryptionKey(payload: string) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch {
        return null;
    }

    if (typeof parsed !== 'object' || parsed === null || !('encryptionKey' in parsed)) {
        return null;
    }

    return typeof parsed.encryptionKey === 'string' ? parsed.encryptionKey : null;
}

/** Strict base64: `Buffer.from` alone skips invalid characters instead of failing. */
function decodeBase64(value: string, what: string) {
    if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw new Error(`${what} is not valid base64`);
    }

    return new Uint8Array(Buffer.from(value, 'base64'));
}

function encodeBase64(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64');
}

function utf8(text: string) {
    return new TextEncoder().encode(text);
}

function concat(first: Uint8Array, second: Uint8Array) {
    const result = new Uint8Array(first.length + second.length);
    result.set(first, 0);
    result.set(second, first.length);
    return result;
}
