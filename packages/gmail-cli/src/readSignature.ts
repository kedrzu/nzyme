import type { Writable } from 'node:stream';

import { errorMessage } from '@nzyme/google-auth/utils/errorMessage.js';

import type { GmailClient } from './createGmailClient.js';

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
        stderr.write(`Warning: no signature, its lookup failed: ${errorMessage(error)}\n`);
        return '';
    }
}
