/**
 * Options for creating a mailto URL.
 */
type MailToOptions = {
    /** BCC recipient */
    bcc?: string;
    /** Email body */
    body?: string;
    /** CC recipient */
    cc?: string;
    /** Email subject */
    subject?: string;
};

/**
 * Creates a mailto: URL with the specified email and options.
 * Properly encodes all parameters for use in a URL.
 * @util
 *
 * @param email - The email address to send to
 * @param options - Additional email parameters
 * @returns A properly formatted mailto: URL
 *
 * @example
 * ```typescript
 * const url = getMailToUrl('user@example.com', {
 *     subject: 'Hello',
 *     body: 'This is a test email',
 *     cc: 'other@example.com'
 * });
 * // url = "mailto:user@example.com?subject=Hello&body=This%20is%20a%20test%20email&cc=other@example.com"
 * ```
 */
export function getMailToUrl(email: string, options: MailToOptions = {}) {
    const url = new URL(`mailto:${email}`);

    if (options.subject) {
        url.searchParams.set('subject', options.subject);
    }

    if (options.cc) {
        url.searchParams.set('cc', options.cc);
    }

    if (options.bcc) {
        url.searchParams.set('bcc', options.bcc);
    }

    if (options.body) {
        url.searchParams.set('body', options.body);
    }

    return url.toString();
}
