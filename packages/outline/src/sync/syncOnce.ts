import { listAll } from '../outline/listAll.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineUser } from '../outline/OutlineTypes.js';
import { pull } from '../reconcile/pull.js';
import type { PullReport } from '../reconcile/pull.js';
import { push } from '../reconcile/push.js';
import type { PushReport } from '../reconcile/push.js';
import { syncSharing } from '../sharing/sharing.js';
import type { SharingReport } from '../sharing/sharing.js';
import { pathExists } from '../utils/pathExists.js';
import type { Workspace } from './resolveWorkspace.js';

/** Epoch milliseconds after which each step starts no new document; leave a step out to skip it. */
export interface SyncDeadlines {
    pull?: number;
    push?: number;
    sharing?: number;
}

export interface SyncOnceOptions {
    client: OutlineClient;
    workspace: Workspace;
    /** `full` makes the pull a full pass and has the sharing step compare Outline's lists too. */
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
    sharing?: SharingReport;
    /** Looked up before the push. */
    privateCollection?: PrivateCollectionLookup;
}

export interface PrivateCollectionLookup {
    /** The name the collection was looked up by. */
    name: string;
    /** `null` when no private collection of that name is visible. */
    id: string | null;
}

/**
 * Runs the steps of one sync in their required order, the pull, the push and then the sharing (which must see
 * what both wrote), each on the state the previous one saved. The caller holds the sync lock. With the documents
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
    if (deadlines.sharing != null) {
        run.sharing = await syncSharing({
            client,
            store,
            state: await store.load(),
            documentsDir,
            mode: options.mode,
            deadline: deadlines.sharing,
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

/** Only a private collection (no workspace-wide permission) qualifies: what is created there must not be shared. */
async function findPrivateCollection(
    client: OutlineClient,
    nameFor: (user: OutlineUser) => string,
): Promise<PrivateCollectionLookup> {
    const { user } = await client.auth.info();
    const name = nameFor(user);
    const collections = await listAll(page => client.collections.list(page));
    const match = collections.find(collection => collection.permission === null && collection.name === name);
    return { name, id: match?.id ?? null };
}
