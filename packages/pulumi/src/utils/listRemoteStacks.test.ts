import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, mock, test } from 'bun:test';

import { isCredentialShapedError } from './listRemoteStacks.js';

describe('isCredentialShapedError', () => {
    test('recognises every AWS SDK credential-resolution error name', () => {
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'CredentialsProviderError' }))).toBe(
            true,
        );
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'TokenProviderError' }))).toBe(true);
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'ExpiredToken' }))).toBe(true);
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'ExpiredTokenException' }))).toBe(true);
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'InvalidClientTokenId' }))).toBe(true);
    });

    test('rejects unrelated errors and non-Error values', () => {
        expect(isCredentialShapedError(new Error('bucket does not exist'))).toBe(false);
        expect(isCredentialShapedError(Object.assign(new Error('nope'), { name: 'NoSuchBucket' }))).toBe(false);
        expect(isCredentialShapedError('plain string')).toBe(false);
        expect(isCredentialShapedError(undefined)).toBe(false);
    });
});

// listRemoteStacks resolves its S3 client lazily inside `.send()`, so the fake client below stands
// in for the whole credential-resolution + network call it would otherwise perform. The module must
// be mocked BEFORE listRemoteStacks.ts is imported, since it resolves S3Client at module load time.
let sendImpl: (command: unknown) => Promise<unknown> = () =>
    Promise.reject(new Error('S3 send not stubbed for this test'));

await mock.module('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send(command: unknown) {
            return sendImpl(command);
        }
    },
    GetObjectCommand,
    ListObjectsV2Command,
}));

const { listRemoteStacks } = await import('./listRemoteStacks.js');

describe('listRemoteStacks', () => {
    afterEach(() => {
        sendImpl = () => Promise.reject(new Error('S3 send not stubbed for this test'));
    });

    test('rethrows a credential-resolution failure instead of returning an empty list', async () => {
        const credentialError = Object.assign(new Error('Could not load credentials'), {
            name: 'CredentialsProviderError',
        });
        sendImpl = () => Promise.reject(credentialError);

        // bun-types declares `.rejects` matchers as synchronous (`void`), so `await
        // expect(...).rejects.toBe(...)` trips `@typescript-eslint/await-thenable` even though it
        // works at runtime. Assert on the caught error directly instead.
        let caughtError: unknown;
        try {
            await listRemoteStacks({ project: 'test-project', backendUrl: 's3://test-bucket' });
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBe(credentialError);
    });

    test('keeps returning an empty list for a non-credential failure', async () => {
        const networkError = new Error('getaddrinfo ENOTFOUND test-bucket.s3.amazonaws.com');
        sendImpl = () => Promise.reject(networkError);

        const result = await listRemoteStacks({ project: 'test-project', backendUrl: 's3://test-bucket' });

        expect(result).toEqual([]);
    });
});
