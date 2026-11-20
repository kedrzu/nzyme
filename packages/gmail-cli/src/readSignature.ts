import type { Writable } from 'node:stream';

import type { GmailClient } from './GmailClientFactory.js';

/**
 * The Gmail signature (HTML) of the account's default send-as address, empty when it has none. A
 * failed lookup never blocks a draft: it is reported on `stderr` and the draft goes without one.
 */
export async function readSignature({ email, gmail, call }: GmailClient, stderr: Writable): Promise<string> {
    try {
        const response = await gmail.users.settings.sendAs.list({ userId: 'me' }, call);
        const sendAs = response.data.sendAs ?? [];
        const entry =
            sendAs.find(address => address.isDefault) ??
            sendAs.find(address => address.sendAsEmail?.toLowerCase() === email.toLowerCase());
        return entry?.signature ?? '';
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        stderr.write(`Warning: no signature, its lookup failed: ${reason}\n`);
        return '';
    }
}
