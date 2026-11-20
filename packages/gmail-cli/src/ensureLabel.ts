import type { gmail_v1 } from '@googleapis/gmail';

import { assert } from '@nzyme/utils/assert.js';

import type { GmailClient } from './GmailClientFactory.js';

/** A user label found or created by {@link ensureLabel}. */
export interface EnsuredLabel {
    id: string;
    name: string;
    created: boolean;
}

/**
 * Finds a label by name, case-insensitively, among `labels` (the account's, from `labels.list`), and
 * creates it when missing. Gmail creates the parents of a nested name (`Clients/Acme`) on its own.
 */
export async function ensureLabel(
    { gmail, call }: GmailClient,
    labels: gmail_v1.Schema$Label[],
    name: string,
): Promise<EnsuredLabel> {
    const existing = labels.find(label => label.name?.toLowerCase() === name.toLowerCase());
    if (existing?.id) {
        return { id: existing.id, name: existing.name ?? name, created: false };
    }

    const created = await gmail.users.labels.create(
        { userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } },
        call,
    );
    const { id } = created.data;
    assert(id, `Gmail created label '${name}' without an id`);

    return { id, name: created.data.name ?? name, created: true };
}
