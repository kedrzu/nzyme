import type { GmailClient } from './createGmailClient.js';

/** The account's label names by id, so commands print names, never ids. */
export async function readLabelNames({ gmail, call }: GmailClient): Promise<Map<string, string>> {
    const response = await gmail.users.labels.list({ userId: 'me' }, call);
    const names = new Map<string, string>();
    for (const label of response.data.labels ?? []) {
        if (label.id && label.name) {
            names.set(label.id, label.name);
        }
    }

    return names;
}
