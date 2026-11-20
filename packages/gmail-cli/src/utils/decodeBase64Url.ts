/**
 * Decodes the base64url data Gmail puts in message bodies.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function decodeBase64Url(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf-8');
}
