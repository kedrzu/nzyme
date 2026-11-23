import { createHash, randomBytes } from 'node:crypto';

/** A PKCE verifier and the challenge derived from it (RFC 7636, method `S256`). */
export interface SlackPkcePair {
    /** Kept in this process and sent only with the code exchange — it stands in for a client secret. */
    verifier: string;
    /** Sent in the authorize URL: the URL-safe base64 SHA-256 of {@link SlackPkcePair.verifier}. */
    challenge: string;
}

/**
 * Creates a fresh PKCE pair for one sign-in. 32 random bytes give a 43-character verifier, the
 * minimum RFC 7636 allows.
 * @__NO_SIDE_EFFECTS__
 */
export function createSlackPkcePair(): SlackPkcePair {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
}
