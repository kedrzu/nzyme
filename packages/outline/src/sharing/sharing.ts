import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { SHARED_FOLDER } from '../discover/tree.js';
import { parseDocFile, serializeDocFile } from '../doc/codec.js';
import type { DocFile } from '../doc/codec.js';
import { OutlineApiError } from '../outline/errors.js';
import { listAll } from '../outline/listAll.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineGroup, OutlineUser } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import type { DocState, FileStat, StateStore, SyncState } from '../state/StateStore.js';
import { readFileIfExists } from '../utils/readFileIfExists.js';
import { toFileStat } from '../utils/toFileStat.js';
import { writeFileAtomic } from '../utils/writeFileAtomic.js';
import { hasConflictMarkers } from '../reconcile/merge.js';

export interface SharingOptions {
    client: OutlineClient;
    store: StateStore;
    /** The state loaded under the sync lock, after the pull and the push; left untouched, the new one is `SharingReport.state` (already saved). */
    state: SyncState;
    documentsDir: string;
    /**
     * A full pass also compares Outline's share lists with the files (membership changes do not move a document's
     * `updatedAt`, so no cheaper signal exists); an incremental one only pushes the lists the user edited.
     */
    mode: 'incremental' | 'full';
    /** Epoch milliseconds; no document is started after it. */
    deadline: number;
    /**
     * How many documents a full pass fetches Outline's list for without a local edit asking for it; each costs two
     * requests. Defaults to 20, so a full pass spends at most about 40 of the 100 requests a minute on it.
     */
    membershipBudget?: number;
    now?: () => number;
}

/** A change to a file's `shared:` list; every path is relative to the documents folder. */
export interface SharingChange {
    path: string;
    added: string[];
    removed: string[];
}

export interface SharingEntryIssue {
    path: string;
    entry: string;
    reason: string;
}

export interface SharingReport {
    /** The state after the step, as saved. */
    state: SyncState;
    /** Files whose list was rewritten to what Outline has. */
    written: SharingChange[];
    /** Entries that match no user or group, or several: they stay in the file, and are reported again every run. */
    unresolved: SharingEntryIssue[];
    /** Entries Outline refused this run (also queued once as a `share-rejected` event); the list went back to Outline's. */
    rejected: SharingEntryIssue[];
    /** The list was edited locally and in Outline: the local edit was applied on top, and these are the differences Outline's side brought. */
    outlineWon: SharingChange[];
    skipped: { path: string; reason: string }[];
    /** Documents whose Outline list was fetched. */
    checked: number;
    /** The deadline came first; the rest waits for the next run. */
    stoppedAtDeadline: boolean;
}

const DEFAULT_MEMBERSHIP_BUDGET = 20;
/** The most memberships one call returns; a document with this many cannot be listed completely. */
const MEMBERSHIPS_PAGE = 100;

type Target = { kind: 'user'; user: OutlineUser } | { kind: 'group'; group: OutlineGroup };
type Resolution = { target: Target } | { reason: string };

/** Outline's direct shares of one document (shares inherited from a parent document are left out). */
interface Truth {
    users: OutlineUser[];
    groups: OutlineGroup[];
}

interface NamedTarget {
    name: string;
    target: Target;
}

/**
 * Keeps each file's `shared:` list and the document's direct shares in Outline equal; the caller holds the sync
 * lock and runs it after the pull and the push. Run it at the end of every turn: a file with unresolved entries
 * is left looking edited (see `settle`) until this step has seen it, and the push in the same turn may have
 * saved it as plain edited.
 *
 * Outline owns the list. A list edited in the file is pushed (added entries resolved to a user or a group, shared
 * `read_write`; removed ones unshared), then the file is rewritten to what Outline holds, so an e-mail becomes the
 * person's name. A refused change is reported once and gone from the file. An entry that cannot be resolved never
 * blocks anything and stays in the file. In a full pass Outline's lists are also read into files nobody edited.
 *
 * Entries are the users' exact full names or e-mails (case-insensitive) and the groups' exact names. The list is
 * written alphabetically, a user by name (by e-mail when another user or a group has the same name).
 */
export async function syncSharing(options: SharingOptions): Promise<SharingReport> {
    const { client, store, documentsDir, deadline } = options;
    const now = options.now ?? Date.now;
    const budget = options.membershipBudget ?? DEFAULT_MEMBERSHIP_BUDGET;
    const state = structuredClone(options.state);
    const report: SharingReport = {
        state,
        written: [],
        unresolved: [],
        rejected: [],
        outlineWon: [],
        skipped: [],
        checked: 0,
        stoppedAtDeadline: false,
    };
    const usersByQuery = new Map<string, Promise<OutlineUser[]>>();
    let allGroups: Promise<OutlineGroup[]> | undefined;

    try {
        const documents = Object.values(state.documents).toSorted((a, b) => a.path.localeCompare(b.path));
        const forced = options.mode === 'full' ? chooseForCheck(documents, budget) : new Set<string>();
        for (const known of documents) {
            if (now() >= deadline) {
                report.stoppedAtDeadline = true;
                break;
            }
            await processDocument(known, forced.has(known.id));
        }
    } finally {
        if (JSON.stringify(state) !== JSON.stringify(options.state)) {
            await store.save(state);
        }
    }
    return report;

    async function processDocument(known: DocState, forced: boolean) {
        const path = known.path;
        const absolute = join(documentsDir, path);
        const stats = await stat(absolute).catch(() => null);
        if (stats == null) {
            return;
        }
        const fileStat = toFileStat(stats);
        const previous = known.sharing;
        if (
            !forced &&
            previous != null &&
            previous.unresolved.length === 0 &&
            previous.stat != null &&
            sameStat(previous.stat, fileStat)
        ) {
            return;
        }
        const bytes = await readFileIfExists(absolute);
        if (bytes == null) {
            return;
        }
        const startHash = contentHash(bytes);
        const content = bytes.toString('utf8');
        const { doc, issues } = parseDocFile(content, basename(path));
        if (issues.some(issue => issue.kind === 'invalid-frontmatter')) {
            report.skipped.push({ path, reason: 'The frontmatter is invalid; the share list is left as it is.' });
            return;
        }
        if (hasConflictMarkers(content)) {
            report.skipped.push({ path, reason: 'The file has an unresolved conflict.' });
            return;
        }

        const listed = uniqueEntries(doc.shared);
        const stateKeys = new Set(known.shared.map(entryKey));
        const listedKeys = new Set(listed.map(entryKey));
        const pending = listed.filter(entry => !stateKeys.has(entryKey(entry)));
        const removed = known.shared.filter(entry => !listedKeys.has(entryKey(entry)));
        const nowIso = new Date(now()).toISOString();
        if (pending.length === 0 && removed.length === 0 && !forced) {
            state.documents[known.id] = {
                ...known,
                sharing: { unresolved: [], checkedAt: previous?.checkedAt, stat: fileStat },
            };
            return;
        }

        let canonical = known.shared;
        const unresolved: string[] = [];
        let before: Truth | null = null;
        let refused = false;
        try {
            before = await fetchTruth(known.id);
        } catch (error) {
            if (!isRejection(error)) {
                throw error;
            }
            // Not allowed to see who the document is shared with, so not to change it either: the list goes back.
            refused = true;
            for (const entry of [...pending, ...removed]) {
                reject(path, entry, error.message);
            }
        }
        if (!refused && before == null) {
            report.skipped.push({ path, reason: `The document is shared with ${MEMBERSHIPS_PAGE} or more.` });
            return;
        }
        if (before != null) {
            report.checked += 1;
            const beforeNames = await namedTargets(before);
            if (pending.length > 0) {
                const outline = difference(
                    beforeNames.map(item => item.name),
                    known.shared,
                );
                if (outline.added.length > 0 || outline.removed.length > 0) {
                    report.outlineWon.push({ path, ...outline });
                }
            }

            let changed = false;
            for (const entry of pending) {
                const resolution = await resolve(entry);
                if ('reason' in resolution) {
                    unresolved.push(entry);
                    report.unresolved.push({ path, entry, reason: resolution.reason });
                } else if (!isShared(before, resolution.target)) {
                    changed = (await change(path, entry, () => addShare(known.id, resolution.target))) || changed;
                }
            }
            for (const entry of removed) {
                const target = findShared(beforeNames, entry);
                if (target != null) {
                    changed = (await change(path, entry, () => removeShare(known.id, target))) || changed;
                }
            }
            const truth = changed ? await fetchTruth(known.id) : before;
            if (truth == null) {
                report.skipped.push({ path, reason: `The document is shared with ${MEMBERSHIPS_PAGE} or more.` });
                return;
            }
            canonical = (await namedTargets(truth)).map(item => item.name).toSorted(compareEntries);
        }
        const final = [
            ...canonical,
            ...unresolved.filter(entry => !canonical.some(name => entryKey(name) === entryKey(entry))),
        ];
        await settle({ known, doc, startHash, fileStat, listed, canonical, final, unresolved, checkedAt: nowIso });
    }

    /**
     * Writes `final` into the file (only while it still holds the bytes read) and records `canonical` as the list
     * Outline holds. `localHash` follows the file when it held no other unsent edit, so a list rewrite is not
     * pushed as a content change; with unresolved entries it stays the hash of the file without them, which keeps
     * the file reading as edited to the pull (it would otherwise overwrite it and lose them).
     */
    async function settle(input: {
        known: DocState;
        doc: DocFile;
        startHash: string;
        fileStat: FileStat;
        listed: string[];
        canonical: string[];
        final: string[];
        unresolved: string[];
        checkedAt: string;
    }) {
        const { known, doc, startHash, listed, canonical, final, unresolved } = input;
        const path = known.path;
        const absolute = join(documentsDir, path);
        const unedited =
            startHash === known.localHash ||
            contentHash(serializeDocFile({ ...doc, shared: known.shared })) === known.localHash;
        const listedExact = new Set(doc.shared);
        const needsWrite = final.length !== listedExact.size || final.some(entry => !listedExact.has(entry));

        let fileStat: FileStat | undefined = input.fileStat;
        let fileHash = startHash;
        let written = false;
        if (needsWrite) {
            const next = serializeDocFile({ ...doc, shared: final });
            const current = await readFileIfExists(absolute);
            if (current != null && contentHash(current) === startHash) {
                await writeFileAtomic(absolute, next);
                written = true;
                fileHash = contentHash(next);
                const after = await stat(absolute);
                fileStat = toFileStat(after);
                report.written.push({ path, ...difference(final, listed) });
            } else {
                report.skipped.push({ path, reason: 'The file changed while the share list was synced.' });
                fileStat = undefined;
            }
        }

        if (known.shared.length !== canonical.length || known.shared.some((entry, i) => entry !== canonical[i])) {
            await rebase(known.id, path, canonical);
        }
        const canonicalHash = contentHash(serializeDocFile({ ...doc, shared: canonical }));
        let localHash = known.localHash;
        if (unedited) {
            localHash = written || unresolved.length > 0 ? canonicalHash : startHash;
        }
        const settled = !needsWrite || written;
        state.documents[known.id] = {
            ...known,
            shared: canonical,
            localHash,
            fileStat: settled && fileHash === localHash ? fileStat : undefined,
            sharing: {
                unresolved,
                checkedAt: input.checkedAt,
                stat: settled && unresolved.length === 0 ? fileStat : undefined,
            },
        };
    }

    /** The merge base carries the list Outline holds, so a later merge sees no difference in the frontmatter. */
    async function rebase(id: string, path: string, canonical: string[]) {
        const base = await store.readBase(id);
        if (base == null) {
            return;
        }
        const next = serializeDocFile({ ...parseDocFile(base, basename(path)).doc, shared: canonical });
        if (next !== base) {
            await store.writeBase(id, next);
        }
    }

    /** Runs one change in Outline: refused ones become a one-time event, other failures end the step. */
    async function change(path: string, entry: string, send: () => Promise<void>) {
        try {
            await send();
            return true;
        } catch (error) {
            if (!isRejection(error)) {
                throw error;
            }
            reject(path, entry, error.message);
            return false;
        }
    }

    function reject(path: string, entry: string, reason: string) {
        state.events.push({ kind: 'share-rejected', path, email: entry, reason });
        report.rejected.push({ path, entry, reason });
    }

    async function addShare(id: string, target: Target) {
        if (target.kind === 'user') {
            await client.documents.addUser({ id, userId: target.user.id, permission: 'read_write' });
        } else {
            await client.documents.addGroup({ id, groupId: target.group.id, permission: 'read_write' });
        }
    }

    async function removeShare(id: string, target: Target) {
        if (target.kind === 'user') {
            await client.documents.removeUser({ id, userId: target.user.id });
        } else {
            await client.documents.removeGroup({ id, groupId: target.group.id });
        }
    }

    /** `null` when the document has more shares than one call returns. */
    async function fetchTruth(id: string): Promise<Truth | null> {
        const userShares = await client.documents.memberships({ id });
        const groupShares = await client.documents.groupMemberships({ id });
        if (
            userShares.memberships.length >= MEMBERSHIPS_PAGE ||
            groupShares.groupMemberships.length >= MEMBERSHIPS_PAGE
        ) {
            return null;
        }
        const users = new Map(userShares.users.map(user => [user.id, user]));
        const groups = new Map(groupShares.groups.map(group => [group.id, group]));
        return {
            users: userShares.memberships
                .filter(membership => membership.sourceId == null)
                .flatMap(membership => users.get(membership.userId) ?? []),
            groups: groupShares.groupMemberships
                .filter(membership => membership.sourceId == null)
                .flatMap(membership => groups.get(membership.groupId) ?? []),
        };
    }

    function isShared(truth: Truth, target: Target) {
        return target.kind === 'user'
            ? truth.users.some(user => user.id === target.user.id)
            : truth.groups.some(group => group.id === target.group.id);
    }

    /** The share an entry of the old list stands for: by its listed name, else by a unique name or e-mail. */
    function findShared(named: NamedTarget[], entry: string) {
        const key = entryKey(entry);
        const exact = named.find(item => entryKey(item.name) === key);
        if (exact != null) {
            return exact.target;
        }
        const loose = named.filter(item =>
            item.target.kind === 'user'
                ? entryKey(item.target.user.name) === key || entryKey(item.target.user.email) === key
                : entryKey(item.target.group.name) === key,
        );
        return loose.length === 1 ? loose[0]?.target : undefined;
    }

    /** The name each share is listed under, one entry per share. */
    async function namedTargets(truth: Truth): Promise<NamedTarget[]> {
        const named: NamedTarget[] = [];
        for (const user of truth.users) {
            named.push({ name: await listedName(user), target: { kind: 'user', user } });
        }
        for (const group of truth.groups) {
            named.push({ name: group.name.trim(), target: { kind: 'group', group } });
        }
        return named;
    }

    /** The full name, or the e-mail when the name is empty or another user or a group has it too. */
    async function listedName(user: OutlineUser) {
        const name = user.name.trim();
        if (name === '') {
            return user.email;
        }
        const key = entryKey(name);
        const sameName = (await findUsers(name)).filter(candidate => entryKey(candidate.name) === key);
        const groups = await listGroups();
        return sameName.length > 1 || groups.some(group => entryKey(group.name) === key) ? user.email : name;
    }

    async function resolve(entry: string): Promise<Resolution> {
        const key = entryKey(entry);
        const users = (await findUsers(entry)).filter(
            user => entryKey(user.name) === key || entryKey(user.email) === key,
        );
        const groups = (await listGroups()).filter(group => entryKey(group.name) === key);
        const [user, group] = [users[0], groups[0]];
        if (users.length + groups.length > 1) {
            return { reason: 'More than one user or group has this name; use an e-mail.' };
        }
        if (user != null) {
            return { target: { kind: 'user', user } };
        }
        if (group != null) {
            return { target: { kind: 'group', group } };
        }
        return { reason: 'No user or group has this name or e-mail.' };
    }

    function findUsers(query: string) {
        const key = entryKey(query);
        let found = usersByQuery.get(key);
        if (found == null) {
            found = listAll(page => client.users.list({ query: query.trim(), ...page }));
            usersByQuery.set(key, found);
        }
        return found;
    }

    function listGroups() {
        allGroups ??= listAll(page => client.groups.list(page));
        return allGroups;
    }
}

/**
 * The documents a full pass fetches Outline's list for. Half the budget (rounded up) goes to the ones whose list
 * is likely to change or matter (a non-empty list, unresolved entries, or a document shared with the user, where
 * shares are made), the rest to the others; either side takes what the other leaves. Within each, the longest
 * unchecked first, so every document is covered in `documents / budget` passes.
 */
function chooseForCheck(documents: DocState[], budget: number) {
    const byStaleness = (a: DocState, b: DocState) =>
        (a.sharing?.checkedAt ?? '').localeCompare(b.sharing?.checkedAt ?? '') || a.path.localeCompare(b.path);
    const likely = (document: DocState) =>
        document.shared.length > 0 ||
        (document.sharing?.unresolved.length ?? 0) > 0 ||
        document.path.startsWith(`${SHARED_FOLDER}/`);
    const priority = documents.filter(likely).toSorted(byStaleness);
    const rest = documents.filter(document => !likely(document)).toSorted(byStaleness);
    const restTake = Math.min(rest.length, budget - Math.min(priority.length, Math.ceil(budget / 2)));
    const priorityTake = Math.min(priority.length, budget - restTake);
    return new Set([...priority.slice(0, priorityTake), ...rest.slice(0, restTake)].map(document => document.id));
}

/** A client error that means Outline refused the change (not a network or server failure, not a lost login). */
function isRejection(error: unknown): error is OutlineApiError {
    return (
        error instanceof OutlineApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 429
    );
}

function entryKey(entry: string) {
    return entry.trim().toLowerCase();
}

/** Trimmed entries without empty ones and without repeats (case-insensitive), in file order. */
function uniqueEntries(entries: string[]) {
    const seen = new Set<string>();
    return entries
        .map(entry => entry.trim())
        .filter(entry => {
            const key = entryKey(entry);
            if (key === '' || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function compareEntries(a: string, b: string) {
    const [keyA, keyB] = [entryKey(a), entryKey(b)];
    if (keyA !== keyB) {
        return keyA < keyB ? -1 : 1;
    }
    return a === b ? 0 : a < b ? -1 : 1;
}

/** What `next` has that `previous` lacks, and the reverse; entries compare ignoring case. */
function difference(next: string[], previous: string[]) {
    const nextKeys = new Set(next.map(entryKey));
    const previousKeys = new Set(previous.map(entryKey));
    return {
        added: next.filter(entry => !previousKeys.has(entryKey(entry))),
        removed: previous.filter(entry => !nextKeys.has(entryKey(entry))),
    };
}

function sameStat(a: FileStat, b: FileStat) {
    return a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino;
}
