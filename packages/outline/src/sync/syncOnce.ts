import { listAll } from '../outline/listAll.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineUser } from '../outline/OutlineTypes.js';
import { pull } from '../reconcile/pull.js';
import type { PullReport } from '../reconcile/pull.js';
import { push } from '../reconcile/push.js';
import type { PushReport } from '../reconcile/push.js';
import { pathExists } from '../utils/pathExists.js';
import type { Workspace } from './resolveWorkspace.js';

/** Epoch milliseconds after which each step starts no new document; leave a step out to skip it. */
export interface SyncDeadlines {
    pull?: number;
    push?: number;
}

export interface SyncOnceOptions {
    client: OutlineClient;
    workspace: Workspace;
    /** `full` makes the pull a full pass. */
    mode: 'incremental' | 'full';
    deadlines: SyncDeadlines;
    /** Gives the name of the user's private collection. */
    privateCollection: (user: OutlineUser) => string;
    /** Filled step by step, so a run that throws midway still tells what it did. */
    run: SyncRun;
    now?: () => number;
}

/** What one sync run did, step by step. */
export interface SyncRun {
    pull?: PullReport;
    push?: PushReport;
    /** Looked up before the push. */
    privateCollection?: PrivateCollectionLookup;
}

export interface PrivateCollectionLookup {
    /** The name the collection was looked up by. */
    name: string;
    /** `null` when no private collection of that name is usable. */
    id: string | null;
    /** Set when a collection of that name exists but has other members, so it was not accepted. */
    sharedWith?: number;
}

/**
 * Runs the steps of one sync in their required order, the pull and then the push, each on the state the previous
 * one saved. The caller holds the sync lock. With the documents
 * folder gone while documents are tracked, nothing is pulled: the push reports the missing folder instead.
 */
export async function syncOnce(options: SyncOnceOptions): Promise<void> {
    const { client, workspace, deadlines, run } = options;
    const { store, documentsDir } = workspace;

    // A pull would recreate a vanished folder, and the push would then take every tracked file as deleted.
    if (deadlines.pull != null && !(await trackedFolderMissing(workspace))) {
        run.pull = await pull({
            client,
            store,
            state: await store.load(),
            documentsDir,
            recoveredDir: workspace.recoveredDir,
            mode: options.mode,
            deadline: deadlines.pull,
            now: options.now,
        });
    }
    if (deadlines.push != null) {
        run.privateCollection = await findPrivateCollection(client, options.privateCollection);
        run.push = await push({
            client,
            store,
            state: await store.load(),
            documentsDir,
            privateCollectionId: run.privateCollection.id,
            deadline: deadlines.push,
            now: options.now,
        });
    }
}

async function trackedFolderMissing(workspace: Workspace): Promise<boolean> {
    if (await pathExists(workspace.documentsDir)) {
        return false;
    }
    const state = await workspace.store.load();
    return Object.keys(state.documents).length > 0;
}

/**
 * Only a collection nobody else can read qualifies: no workspace-wide permission and the user as its only member,
 * directly and through groups. A same-named collection made by an admin keeps the admin as a member, so it does not.
 */
export async function findPrivateCollection(
    client: OutlineClient,
    nameFor: (user: OutlineUser) => string,
): Promise<PrivateCollectionLookup> {
    const { user } = await client.auth.info();
    const name = nameFor(user);
    const collections = await listAll(page => client.collections.list(page));
    let sharedWith: number | undefined;
    for (const collection of collections) {
        if (collection.permission !== null || collection.name !== name) {
            continue;
        }
        const users = await listAll(page => client.collections.memberships({ id: collection.id, ...page }));
        const groups = await listAll(page => client.collections.groupMemberships({ id: collection.id, ...page }));
        const others = users.filter(membership => membership.userId !== user.id).length + groups.length;
        if (others === 0) {
            return { name, id: collection.id };
        }
        sharedWith = Math.max(sharedWith ?? 0, others);
    }
    return { name, id: null, ...(sharedWith == null ? {} : { sharedWith }) };
}
