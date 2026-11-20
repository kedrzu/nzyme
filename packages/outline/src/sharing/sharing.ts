import { listAll } from '../outline/listAll.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineGroup, OutlinePermission, OutlineUser } from '../outline/OutlineTypes.js';

/** Who a document can be shared with. */
export type ShareTarget = { kind: 'user'; user: OutlineUser } | { kind: 'group'; group: OutlineGroup };

/** One direct share of a document (a share inherited from a parent document is not one). */
export type DirectShare = ShareTarget & { permission: OutlinePermission };

/** A name that matches no user or group, or several. */
export class ShareTargetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShareTargetError';
    }
}

/**
 * The user whose exact full name or e-mail is `name`, or the group with that exact name, ignoring case. Throws
 * `ShareTargetError` when none or several match.
 */
export async function findShareTarget(client: OutlineClient, name: string): Promise<ShareTarget> {
    const key = nameKey(name);
    const users = (await listAll(page => client.users.list({ query: name.trim(), ...page }))).filter(
        user => nameKey(user.name) === key || nameKey(user.email) === key,
    );
    const groups = (await listAll(page => client.groups.list(page))).filter(group => nameKey(group.name) === key);
    const [user, group] = [users[0], groups[0]];
    if (users.length + groups.length > 1) {
        throw new ShareTargetError(`More than one Outline user or group is named "${name}"; use an e-mail.`);
    }
    if (user != null) {
        return { kind: 'user', user };
    }
    if (group != null) {
        return { kind: 'group', group };
    }
    throw new ShareTargetError(`No Outline user or group has the name or e-mail "${name}".`);
}

/** Gives the target `read_write` access to the document. */
export async function share(client: OutlineClient, id: string, target: ShareTarget): Promise<void> {
    if (target.kind === 'user') {
        await client.documents.addUser({ id, userId: target.user.id, permission: 'read_write' });
    } else {
        await client.documents.addGroup({ id, groupId: target.group.id, permission: 'read_write' });
    }
}

/** Removes the target's direct share of the document; access through a collection or a parent stays. */
export async function unshare(client: OutlineClient, id: string, target: ShareTarget): Promise<void> {
    if (target.kind === 'user') {
        await client.documents.removeUser({ id, userId: target.user.id });
    } else {
        await client.documents.removeGroup({ id, groupId: target.group.id });
    }
}

/** The document's direct user and group shares, up to 100 of each (what one call returns). */
export async function directShares(client: OutlineClient, id: string): Promise<DirectShare[]> {
    const userShares = await client.documents.memberships({ id });
    const groupShares = await client.documents.groupMemberships({ id });
    const users = new Map(userShares.users.map(user => [user.id, user]));
    const groups = new Map(groupShares.groups.map(group => [group.id, group]));
    return [
        ...userShares.memberships.flatMap(membership => {
            const user = users.get(membership.userId);
            return membership.sourceId == null && user != null
                ? [{ kind: 'user' as const, user, permission: membership.permission }]
                : [];
        }),
        ...groupShares.groupMemberships.flatMap(membership => {
            const group = groups.get(membership.groupId);
            return membership.sourceId == null && group != null
                ? [{ kind: 'group' as const, group, permission: membership.permission }]
                : [];
        }),
    ];
}

function nameKey(name: string) {
    return name.trim().toLowerCase();
}
