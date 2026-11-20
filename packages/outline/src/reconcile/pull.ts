import { mkdir, readdir, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import { assert } from '@nzyme/utils/assert.js';

import { discoverFull, discoverIncremental } from '../discover/discover.js';
import { ATTACHMENTS_FOLDER, DRAFTS_FOLDER, assignPaths } from '../discover/tree.js';
import type { TreeDocument, TreeResult } from '../discover/tree.js';
import { parseDocFile } from '../doc/codec.js';
import { findOutlineAttachments } from '../doc/links.js';
import { pickFreeName } from '../doc/naming.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import type { DocState, StateStore, SyncState } from '../state/StateStore.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isInside } from '../utils/isInside.js';
import { pathDepth } from '../utils/pathDepth.js';
import { pathExists } from '../utils/pathExists.js';
import { readFileIfExists } from '../utils/readFileIfExists.js';
import { writeFileAtomic } from '../utils/writeFileAtomic.js';
import { writeFileIfUnchanged } from '../utils/writeFileIfUnchanged.js';
import { localContent } from './localContent.js';
import { hasConflictMarkers, mergeDocument } from './merge.js';

export interface PullOptions {
    client: OutlineClient;
    store: StateStore;
    /** The state loaded under the sync lock; left untouched, the new one is `PullReport.state` (already saved). */
    state: SyncState;
    documentsDir: string;
    /** Where a document that vanished from Outline with unsent local changes is moved, under its relative path. */
    recoveredDir: string;
    /** `incremental` never acts on a document's absence; `full` (also forced until the initial pull completes) does. */
    mode: 'incremental' | 'full';
    /** Epoch milliseconds; no document or attachment is started after it. */
    deadline: number;
    /** Downloads an attachment from its signed storage URL. Called without the Outline token. Defaults to `fetch`. */
    fetchFile?: (url: string) => Promise<Response>;
    now?: () => number;
}

/** Every path is relative to the documents folder, except `recovered`, relative to the recovered folder. */
export interface PullReport {
    /** The state after the pull, as saved. */
    state: SyncState;
    /** Files created or rewritten, conflicts included. */
    written: string[];
    moved: PullMove[];
    /** Files deleted because their document left Outline or the user's reach, with no local changes. */
    removed: string[];
    recovered: string[];
    /** Files now holding conflict markers. */
    conflicts: string[];
    /** Files merged cleanly whose content differs from Outline's: local work the push sends. */
    toPush: string[];
    skipped: PullSkip[];
    attachmentsDownloaded: string[];
    attachmentsFailed: PullSkip[];
    /** The deadline came first; the rest waits for the next pull (the cursor did not advance). */
    stoppedAtDeadline: boolean;
}

export interface PullMove {
    from: string;
    to: string;
}

export interface PullSkip {
    path: string;
    reason: string;
}

/**
 * Brings Outline's changes into the local files; the caller holds the sync lock. Local work is never lost:
 * a document edited on both sides is merged (conflict markers when the same paragraph changed), a file
 * edited while the pull ran is left for the next one, and a document gone from Outline with local
 * changes is moved to `recoveredDir`. A pull that finds nothing new writes nothing.
 *
 * Merge base after a conflict: `base/<id>.md` becomes Outline's content the conflict was merged against
 * (revision `conflictRevision`), since that is what the resolved file contains. While the markers are in
 * the file, later Outline revisions are not merged in and `revision` stays at `conflictRevision`; the
 * next merge (by a later pull once the markers are gone, or by the push) takes the resolved file, that
 * base and Outline's latest content, so changes made in Outline meanwhile are merged rather than lost.
 */
export async function pull(options: PullOptions): Promise<PullReport> {
    const { client, store, documentsDir, recoveredDir, deadline } = options;
    const now = options.now ?? Date.now;
    const fetchFile = options.fetchFile ?? ((url: string) => fetch(url));
    const state = structuredClone(options.state);
    const report: PullReport = {
        state,
        written: [],
        moved: [],
        removed: [],
        recovered: [],
        conflicts: [],
        toPush: [],
        skipped: [],
        attachmentsDownloaded: [],
        attachmentsFailed: [],
        stoppedAtDeadline: false,
    };
    const initial = !state.initialPull.complete;
    const full = options.mode === 'full' || initial;

    try {
        const discovery = full
            ? await discoverFull(client, { cursor: state.cursor, knownIds: Object.keys(state.documents) })
            : await discoverIncremental(client, {
                  cursor: state.cursor,
                  knownCollectionIds: Object.keys(state.collections),
                  knownDocuments: state.documents,
              });
        const creating = new Set(Object.values(state.pendingCreates));
        const remotes = discovery.documents.filter(document => !creating.has(document.id));
        const visible = new Set(discovery.documents.map(document => document.id));
        const unchanged = full ? [] : Object.values(state.documents).filter(document => !visible.has(document.id));
        const tree = assignPaths({
            documents: [...remotes.map(remoteTreeDocument), ...unchanged.map(stateTreeDocument)],
            collections: discovery.collections,
            state,
        });
        const droppedFolders = full ? vanishedCollectionFolders(tree, discovery.collections) : [];
        state.collections = tree.collections;
        for (const folder of Object.values(state.collections)) {
            await mkdir(join(documentsDir, folder), { recursive: true });
        }

        const work = remotes
            .map(remote => {
                const path = tree.paths.get(remote.id);
                assert(path != null, `No path assigned to document ${remote.id}`);
                return { remote, path };
            })
            .filter(({ remote, path }) => needsWork(state.documents[remote.id], remote, path))
            // Parents first, so a moved parent takes its children's folder along before they are looked at.
            .toSorted((a, b) => pathDepth(a.path) - pathDepth(b.path) || a.remote.id.localeCompare(b.remote.id));

        for (const { remote, path } of initial ? resumeAfter(work, state.initialPull.position) : work) {
            if (now() >= deadline) {
                report.stoppedAtDeadline = true;
                break;
            }
            await syncDocument(remote, path);
            if (initial) {
                state.initialPull.position = remote.id;
            }
        }

        if (!report.stoppedAtDeadline) {
            if (full) {
                await dropVanished(visible);
                for (const folder of droppedFolders) {
                    await removeFolderWithoutFiles(join(documentsDir, folder));
                }
                state.lastFullPass = new Date(now()).toISOString();
            }
            state.cursor = discovery.cursor;
            if (initial) {
                state.initialPull = { complete: true, position: null };
            }
            await downloadMissingAttachments();
        }
    } finally {
        if (JSON.stringify(state) !== JSON.stringify(options.state)) {
            await store.save(state);
        }
    }
    return report;

    async function syncDocument(remote: OutlineDocument, path: string) {
        const known = state.documents[remote.id];
        if (known == null) {
            await createDocument(remote, path);
            return;
        }
        const placed = known.path === path ? known : await moveDocument(known, path);
        const current: DocState = {
            ...placed,
            parentId: remote.parentDocumentId,
            collectionId: remote.collectionId,
        };
        state.documents[remote.id] = current;
        if (remote.revision !== current.revision) {
            await updateContent(remote, current);
        }
    }

    async function createDocument(remote: OutlineDocument, path: string) {
        const target = await freePath(documentsDir, path);
        const content = localContent(remote, {});
        await writeFileAtomic(join(documentsDir, target), content);
        await store.writeBase(remote.id, content);
        state.documents[remote.id] = {
            id: remote.id,
            path: target,
            revision: remote.revision,
            title: remote.title,
            parentId: remote.parentDocumentId,
            collectionId: remote.collectionId,
            localHash: contentHash(content),
        };
        report.written.push(target);
    }

    /** Moves the file, its attachments and its children's folder; never renames the file unless the target name is taken on disk. */
    async function moveDocument(known: DocState, path: string): Promise<DocState> {
        const target = await freePath(documentsDir, path);
        const from = join(documentsDir, known.path);
        const to = join(documentsDir, target);
        const bytes = await readFileIfExists(from);
        if (bytes != null) {
            await mkdir(dirname(to), { recursive: true });
            await rename(from, to);
            await moveAttachments(bytes.toString('utf8'), dirname(from), dirname(to));
        }

        const fromFolder = stem(known.path);
        const toFolder = stem(target);
        if ((await pathExists(join(documentsDir, fromFolder))) && !(await pathExists(join(documentsDir, toFolder)))) {
            await rename(join(documentsDir, fromFolder), join(documentsDir, toFolder));
            for (const document of Object.values(state.documents)) {
                if (document.path.startsWith(`${fromFolder}/`)) {
                    document.path = `${toFolder}${document.path.slice(fromFolder.length)}`;
                }
            }
            for (const [pendingPath, id] of Object.entries(state.pendingCreates)) {
                if (pendingPath.startsWith(`${fromFolder}/`)) {
                    delete state.pendingCreates[pendingPath];
                    state.pendingCreates[`${toFolder}${pendingPath.slice(fromFolder.length)}`] = id;
                }
            }
        }
        await removeEmptyFolders(dirname(from));
        report.moved.push({ from: known.path, to: target });
        return { ...known, path: target };
    }

    async function updateContent(remote: OutlineDocument, known: DocState) {
        const path = known.path;
        const bytes = await readFileIfExists(join(documentsDir, path));
        if (bytes == null) {
            report.skipped.push({ path, reason: 'The file is missing locally.' });
            return;
        }
        const startHash = contentHash(bytes);
        const local = bytes.toString('utf8');
        const base = await store.readBase(remote.id);
        // Frontmatter keys other than `outline` are local only; Outline's side keeps the agreed ones.
        const extra = parseDocFile(base ?? local, basename(path)).doc.extra;
        const theirs = localContent(remote, extra);
        const accepted: DocState = {
            ...known,
            revision: remote.revision,
            title: remote.title,
            localHash: contentHash(theirs),
        };

        if (startHash === known.localHash) {
            if (local !== theirs && !(await writeIfUnchanged(path, startHash, theirs))) {
                return;
            }
            if (base !== theirs) {
                await store.writeBase(remote.id, theirs);
            }
            state.documents[remote.id] = withoutConflict(accepted);
            if (local !== theirs) {
                report.written.push(path);
                await removeDroppedAttachments(path, local, theirs);
            }
            return;
        }

        if (known.conflictRevision != null && hasConflictMarkers(local)) {
            report.skipped.push({ path, reason: 'The file has an unresolved conflict.' });
            return;
        }
        if (base === theirs) {
            // A new revision with the same content (e.g. a move or a no-op save): nothing to merge.
            state.documents[remote.id] = accepted;
            return;
        }

        const merged =
            local === theirs
                ? { content: theirs, conflict: false }
                : await mergeDocument({
                      ours: local,
                      base: base ?? '',
                      theirs,
                      theirsAuthor: remote.updatedBy.name,
                  });
        if (merged.content !== local && !(await writeIfUnchanged(path, startHash, merged.content))) {
            return;
        }
        if (base !== theirs) {
            await store.writeBase(remote.id, theirs);
        }
        if (merged.conflict) {
            state.documents[remote.id] = { ...accepted, conflictRevision: remote.revision };
            report.conflicts.push(path);
        } else {
            state.documents[remote.id] = withoutConflict(accepted);
            if (merged.content !== theirs) {
                report.toPush.push(path);
            }
        }
        if (merged.content !== local) {
            report.written.push(path);
            await removeDroppedAttachments(path, local, merged.content);
        }
    }

    /** Writes `content` unless the file was edited meanwhile (it hashes differently from `startHash`); then it waits for the next pull. */
    async function writeIfUnchanged(path: string, startHash: string, content: string) {
        const written = await writeFileIfUnchanged(join(documentsDir, path), startHash, content);
        if (!written) {
            report.skipped.push({ path, reason: 'The file changed while the pull ran.' });
        }
        return written;
    }

    /** Full pass only: documents Outline confirmed archived, deleted or no longer shared. Unsent local changes go to `recoveredDir`. */
    async function dropVanished(visible: Set<string>) {
        for (const document of Object.values(state.documents).toSorted((a, b) => a.path.localeCompare(b.path))) {
            if (visible.has(document.id)) {
                continue;
            }
            const file = join(documentsDir, document.path);
            const bytes = await readFileIfExists(file);
            if (bytes != null && contentHash(bytes) === document.localHash) {
                await rm(file);
                for (const attachment of findOutlineAttachments(bytes.toString('utf8'))) {
                    await rm(join(dirname(file), attachment.path), { force: true });
                }
                await removeEmptyFolders(join(dirname(file), ATTACHMENTS_FOLDER));
                report.removed.push(document.path);
            } else if (bytes != null) {
                const recovered = await recover(document.path, bytes.toString('utf8'));
                state.events.push({ kind: 'recovered', path: recovered });
                report.recovered.push(recovered);
            }
            delete state.documents[document.id];
            await store.deleteBase(document.id);
            await removeEmptyFolders(dirname(file));
        }
    }

    /** Moves the file and its attachments to the same relative path under `recoveredDir`, never over an existing file. */
    async function recover(path: string, content: string) {
        const target = await freePath(recoveredDir, path);
        const from = join(documentsDir, path);
        const to = join(recoveredDir, target);
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
        await moveAttachments(content, dirname(from), dirname(to));
        return target;
    }

    async function moveAttachments(content: string, fromFolder: string, toFolder: string) {
        for (const attachment of findOutlineAttachments(content)) {
            const from = join(fromFolder, attachment.path);
            const to = join(toFolder, attachment.path);
            if ((await pathExists(from)) && !(await pathExists(to))) {
                await mkdir(dirname(to), { recursive: true });
                await rename(from, to);
            }
        }
        await removeEmptyFolders(join(fromFolder, ATTACHMENTS_FOLDER));
    }

    /** After a rewrite, deletes the attachments the old content linked to and the new one does not. */
    async function removeDroppedAttachments(path: string, before: string, after: string) {
        const kept = new Set(findOutlineAttachments(after).map(attachment => attachment.path));
        const folder = dirname(join(documentsDir, path));
        for (const attachment of findOutlineAttachments(before)) {
            if (!kept.has(attachment.path)) {
                await rm(join(folder, attachment.path), { force: true });
            }
        }
        await removeEmptyFolders(join(folder, ATTACHMENTS_FOLDER));
    }

    /** Every tracked file's Outline attachments that are not on disk yet; a failed download is retried next pull. */
    async function downloadMissingAttachments() {
        for (const document of Object.values(state.documents).toSorted((a, b) => a.path.localeCompare(b.path))) {
            const bytes = await readFileIfExists(join(documentsDir, document.path));
            if (bytes == null) {
                continue;
            }
            const folder = dirname(join(documentsDir, document.path));
            for (const attachment of findOutlineAttachments(bytes.toString('utf8'))) {
                const target = join(folder, attachment.path);
                if (await pathExists(target)) {
                    continue;
                }
                if (now() >= deadline) {
                    report.stoppedAtDeadline = true;
                    return;
                }
                const path = relative(documentsDir, target);
                try {
                    const url = await client.attachments.redirect({ id: attachment.id });
                    const response = await fetchFile(url);
                    if (!response.ok) {
                        throw new Error(`Download answered ${response.status}`);
                    }
                    await writeFileAtomic(target, new Uint8Array(await response.arrayBuffer()));
                    report.attachmentsDownloaded.push(path);
                } catch (error) {
                    report.attachmentsFailed.push({
                        path,
                        reason: error instanceof Error ? error.message : 'unknown error',
                    });
                }
            }
        }
    }

    /** Removes `folder` with its sub-folders, but only when no file is anywhere inside. */
    async function removeFolderWithoutFiles(folder: string) {
        const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => null);
        if (entries != null && entries.every(entry => entry.isDirectory())) {
            await rm(folder, { recursive: true, force: true });
        }
    }

    /** Removes `folder` and its parents while they are empty, never the documents folder itself. */
    async function removeEmptyFolders(folder: string) {
        for (let current = folder; isInside(documentsDir, current); current = dirname(current)) {
            try {
                await rmdir(current);
            } catch (error) {
                if (!isErrorCode(error, 'ENOENT')) {
                    return;
                }
            }
        }
    }
}

/**
 * Drops the collections the full pass no longer lists from `tree.collections` (the map the state takes) and
 * returns their folders, minus any a document still sits in.
 */
function vanishedCollectionFolders(tree: TreeResult, listed: { id: string }[]) {
    const visible = new Set(listed.map(collection => collection.id));
    const used = new Set([...tree.paths.values()].map(path => path.split('/')[0]));
    const dropped: string[] = [];
    for (const [id, folder] of Object.entries(tree.collections)) {
        if (!visible.has(id) && !used.has(folder)) {
            delete tree.collections[id];
            dropped.push(folder);
        }
    }
    return dropped;
}

/** A document needs attention when it is new, has a new revision, or moved. */
function needsWork(known: DocState | undefined, remote: OutlineDocument, path: string) {
    return (
        known == null ||
        known.revision !== remote.revision ||
        known.path !== path ||
        known.parentId !== remote.parentDocumentId ||
        known.collectionId !== remote.collectionId
    );
}

/** An interrupted initial pull starts after the last document it finished. */
function resumeAfter<T extends { remote: OutlineDocument }>(work: T[], position: string | null) {
    const index = work.findIndex(item => item.remote.id === position);
    return index === -1 ? work : [...work.slice(index + 1), ...work.slice(0, index + 1)];
}

function withoutConflict(document: DocState): DocState {
    const result = { ...document };
    delete result.conflictRevision;
    return result;
}

function remoteTreeDocument(remote: OutlineDocument): TreeDocument {
    return {
        id: remote.id,
        title: remote.title,
        collectionId: remote.collectionId,
        parentId: remote.parentDocumentId,
        published: remote.publishedAt != null,
        createdAt: remote.createdAt,
    };
}

/** A known document the incremental pass did not list keeps its place; only drafts live in the drafts folder. */
function stateTreeDocument(known: DocState): TreeDocument {
    return {
        id: known.id,
        title: known.title,
        collectionId: known.collectionId,
        parentId: known.parentId,
        published: !known.path.startsWith(`${DRAFTS_FOLDER}/`),
    };
}

/** `path` (relative to `root`) or, when a file already sits there, the first free `name-2.md` style name in its folder. */
async function freePath(root: string, path: string) {
    if (!(await pathExists(join(root, path)))) {
        return path;
    }
    const folder = dirname(path);
    const taken = await readdir(join(root, folder)).catch(() => []);
    const name = pickFreeName(basename(path, '.md'), taken, '.md');
    return folder === '.' ? name : `${folder}/${name}`;
}

function stem(path: string) {
    return path.slice(0, -'.md'.length);
}
