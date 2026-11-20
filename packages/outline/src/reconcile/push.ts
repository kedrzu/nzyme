import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { assert } from '@nzyme/utils/assert.js';

import { DRAFTS_FOLDER, SHARED_FOLDER } from '../discover/tree.js';
import { parseDocFile, serializeDocFile } from '../doc/codec.js';
import type { DocFile } from '../doc/codec.js';
import {
    ATTACHMENTS_FOLDER,
    findLocalAttachments,
    findOutlineAttachments,
    linkUploadedAttachments,
    toLocalLinks,
    toOutlineLinks,
    withoutLocalAttachments,
} from '../doc/links.js';
import { OutlineApiError, OutlineConflictError } from '../outline/errors.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type { DocumentsCreateParams, OutlineDocument } from '../outline/OutlineTypes.js';
import { contentHash } from '../state/contentHash.js';
import type { DocState, StateStore, SyncState } from '../state/StateStore.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { isInside } from '../utils/isInside.js';
import { pathDepth } from '../utils/pathDepth.js';
import { pathExists } from '../utils/pathExists.js';
import { readFileIfExists } from '../utils/readFileIfExists.js';
import { readTextIfExists } from '../utils/readTextIfExists.js';
import { writeFileAtomic } from '../utils/writeFileAtomic.js';
import { writeFileIfUnchanged } from '../utils/writeFileIfUnchanged.js';
import { localContent } from './localContent.js';
import { hasConflictMarkers, mergeDocument } from './merge.js';

export interface PushOptions {
    client: OutlineClient;
    store: StateStore;
    /** The state loaded under the sync lock; left untouched, the new one is `PushReport.state` (already saved). */
    state: SyncState;
    documentsDir: string;
    /**
     * The user's own private collection: a file placed at the root of the documents folder is created in it.
     * `null` when it was not found: such a file is skipped, and nothing is created.
     */
    privateCollectionId: string | null;
    /** Epoch milliseconds; no document is started after it. */
    deadline: number;
    /** Posts an attachment to its presigned storage URL. Called without the Outline token. Defaults to `fetch`. */
    uploadFile?: (url: string, body: FormData) => Promise<Response>;
    now?: () => number;
}

/** Every path is relative to the documents folder. */
export interface PushReport {
    /** The state after the push, as saved. */
    state: SyncState;
    /** Files created as new Outline documents (copies included). */
    created: string[];
    updated: string[];
    /** Files whose new place Outline now follows (a rename needs no call). */
    moved: PushMove[];
    /** Files deleted locally whose documents were archived. */
    archived: string[];
    /** Files holding conflict markers: never sent until the agent resolves them. */
    conflicts: string[];
    /** Set when this run archived nothing because the documents folder looks broken rather than edited. */
    refusedArchives: RefusedArchives | null;
    /** Files that carried another file's `outline:` id (a copy) and became new documents. */
    copies: string[];
    /** Local files uploaded as Outline attachments. */
    attachmentsUploaded: string[];
    skipped: PushSkip[];
    /** The deadline came first; the rest waits for the next push. */
    stoppedAtDeadline: boolean;
}

export interface PushMove {
    from: string;
    to: string;
}

export interface PushSkip {
    path: string;
    reason: string;
}

export interface RefusedArchives {
    reason: string;
    /** The tracked files that are missing. */
    paths: string[];
}

/**
 * Deleting up to this many tracked files at once is always taken as meant; above it, only while at most half of
 * the tracked files go. See `archiveRefusal`.
 */
const SMALL_DELETE = 3;
/** An `outline:` line, read from a frontmatter block too broken to parse, so its document is not taken as deleted. */
const BROKEN_FRONTMATTER_ID = /^outline:\s*["']?([\w-]+)/m;

/** A `.md` file found in the documents folder. */
interface LocalFile {
    path: string;
    mtimeMs: number;
    read: FileRead;
    /** The Outline document the file stands for; absent for a file not created yet (or a copy). */
    id?: string;
    /** Set on a copy: the id it carried, which stays with the original. */
    copyOf?: string;
}

interface FileRead {
    content: string;
    hash: string;
    /** The frontmatter is not valid: nothing is sent from the file. */
    invalid: boolean;
}

type Placement =
    | { kind: 'collection'; collectionId: string; parentId: string | null }
    | { kind: 'draft' }
    | { kind: 'refused'; reason: string };

/** What Outline and the file agree on after a write: the document in local form. */
interface Agreed {
    title: string;
    /** Local form (`toLocalLinks`). */
    text: string;
    revision: number;
    collectionId: string | null;
    parentId: string | null;
}

/**
 * Sends local work to Outline; the caller holds the sync lock. New files are created (once, even when the process
 * dies before the id reaches the file), edited ones updated against the revision they were based on (a newer
 * Outline version is merged in first), moved ones moved, deleted ones archived (never deleted). A file with
 * conflict markers or broken frontmatter is never sent; an unchanged file sends nothing.
 *
 * After every write the file is rewritten to what Outline stored (its Markdown normalisation, the `outline:` id),
 * but only while it still holds the bytes that were sent: an edit made meanwhile stays, and goes out next time.
 */
export async function push(options: PushOptions): Promise<PushReport> {
    const { client, store, documentsDir, privateCollectionId, deadline } = options;
    const now = options.now ?? Date.now;
    const uploadFile = options.uploadFile ?? ((url: string, body: FormData) => fetch(url, { method: 'POST', body }));
    const state = structuredClone(options.state);
    const report: PushReport = {
        state,
        created: [],
        updated: [],
        moved: [],
        archived: [],
        conflicts: [],
        refusedArchives: null,
        copies: [],
        attachmentsUploaded: [],
        skipped: [],
        stoppedAtDeadline: false,
    };

    const folderProblem = await checkFolder(documentsDir);
    if (folderProblem != null) {
        const paths = Object.values(state.documents).map(document => document.path);
        if (paths.length > 0) {
            report.refusedArchives = { reason: folderProblem, paths: paths.toSorted() };
        }
        return report;
    }

    const collectionByFolder = new Map(Object.entries(state.collections).map(([id, folder]) => [folder, id]));
    const idAtPath = new Map<string, string>();
    /** Uploaded files from `_attachments/`, removed at the end unless a document still links them. */
    const uploadedSources = new Set<string>();

    try {
        const files = await scanFolder();
        identifyFiles(files);
        dropStalePendingCreates(files);
        for (const file of files) {
            if (file.id != null) {
                idAtPath.set(file.path, file.id);
            }
        }

        const present = new Set(files.flatMap(file => (file.id == null ? [] : [file.id])));
        const vanished = Object.values(state.documents).filter(document => !present.has(document.id));
        const refusal = archiveRefusal(vanished.length, Object.keys(state.documents).length);
        if (refusal != null) {
            report.refusedArchives = { reason: refusal, paths: vanished.map(document => document.path).toSorted() };
        }

        // Parents first, so a child finds its parent created or moved already.
        for (const file of files.toSorted(
            (a, b) => pathDepth(a.path) - pathDepth(b.path) || a.path.localeCompare(b.path),
        )) {
            if (now() >= deadline) {
                report.stoppedAtDeadline = true;
                break;
            }
            try {
                await pushFile(file, file.read);
            } catch (error) {
                if (!(error instanceof OutlineApiError)) {
                    throw error;
                }
                report.skipped.push({ path: file.path, reason: error.message });
            }
        }

        if (!report.stoppedAtDeadline && refusal == null) {
            await archiveVanished(vanished, present);
        }
        await removeUploadedSources();
    } finally {
        if (JSON.stringify(state) !== JSON.stringify(options.state)) {
            await store.save(state);
        }
    }
    return report;

    async function scanFolder() {
        const files: LocalFile[] = [];
        for (const path of await listMarkdownFiles(documentsDir)) {
            const absolute = join(documentsDir, path);
            const { mtimeMs } = await stat(absolute);
            const bytes = await readFileIfExists(absolute);
            if (bytes == null) {
                continue;
            }
            const content = bytes.toString('utf8');
            const { doc, issues } = parseDocFile(content, basename(path));
            const invalid = issues.some(issue => issue.kind === 'invalid-frontmatter');
            files.push({
                path,
                mtimeMs,
                read: { content, hash: contentHash(bytes), invalid },
                id: invalid ? BROKEN_FRONTMATTER_ID.exec(content)?.[1] : doc.id,
            });
        }
        return files;
    }

    /**
     * An id found in two files stays with the one at the tracked path (else the older one); the other is a copy and
     * becomes a new document. A file at a tracked path whose id went missing (the agent rewrote it without the
     * frontmatter) is still that document, unless its id turned up elsewhere.
     */
    function identifyFiles(files: LocalFile[]) {
        const holders = new Map<string, LocalFile[]>();
        for (const file of files) {
            if (file.id != null) {
                holders.set(file.id, [...(holders.get(file.id) ?? []), file]);
            }
        }
        for (const [id, group] of holders) {
            if (group.length < 2) {
                continue;
            }
            const keeper =
                group.find(file => file.path === state.documents[id]?.path) ??
                group.toSorted((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path))[0];
            for (const file of group) {
                if (file !== keeper) {
                    file.copyOf = id;
                    delete file.id;
                }
            }
        }

        const found = new Set(holders.keys());
        const trackedAt = new Map(Object.values(state.documents).map(document => [document.path, document.id]));
        for (const file of files) {
            const tracked = trackedAt.get(file.path);
            if (file.id == null && file.copyOf == null && tracked != null && !found.has(tracked)) {
                file.id = tracked;
                found.add(tracked);
            }
        }
    }

    /** A recorded create whose file is gone (or now names another document) can never be adopted; pull takes the document. */
    function dropStalePendingCreates(files: LocalFile[]) {
        const byPath = new Map(files.map(file => [file.path, file]));
        for (const [path, id] of Object.entries(state.pendingCreates)) {
            const atPath = byPath.get(path);
            const adoptable = files.some(file => file.id === id) || (atPath != null && atPath.id == null);
            if (state.documents[id] != null || !adoptable) {
                delete state.pendingCreates[path];
            }
        }
    }

    async function pushFile(file: LocalFile, read: FileRead) {
        if (read.invalid) {
            report.skipped.push({
                path: file.path,
                reason: 'The frontmatter is invalid; nothing is sent until it is fixed.',
            });
            return;
        }
        const id = file.id;
        if (id == null) {
            const pending = state.pendingCreates[file.path];
            await (pending == null ? createDocument(file, read) : adoptCreated(file.path, read, pending));
            return;
        }
        const known = state.documents[id];
        if (known == null) {
            if (Object.values(state.pendingCreates).includes(id)) {
                await adoptCreated(file.path, read, id);
            } else {
                report.skipped.push({ path: file.path, reason: `Sync does not know the document ${id}.` });
            }
            return;
        }
        await placeDocument(file.path, known);
        await syncContent(file, read, id);
    }

    async function createDocument(file: LocalFile, read: FileRead) {
        const placement = placementOf(file.path);
        if (placement.kind === 'refused') {
            report.skipped.push({ path: file.path, reason: placement.reason });
            return;
        }
        if (hasConflictMarkers(read.content)) {
            report.conflicts.push(file.path);
            return;
        }
        const { doc } = parseDocFile(read.content, basename(file.path));
        // Local attachment links stay out until uploaded, so Outline's text (the base) never holds one the agent added.
        const params: DocumentsCreateParams = {
            title: doc.title,
            text: toOutlineLinks(withoutLocalAttachments(doc.text)),
        };
        if (placement.kind === 'collection') {
            params.collectionId = placement.collectionId;
            params.parentDocumentId = placement.parentId ?? undefined;
            params.publish = true;
        }
        const remote = await client.documents.create(params);
        // Saved before the id goes into the file: a run killed in between adopts this id instead of creating again.
        state.pendingCreates[file.path] = remote.id;
        await store.save(state);
        idAtPath.set(file.path, remote.id);
        report.created.push(file.path);
        if (file.copyOf != null) {
            report.copies.push(file.path);
        }
        await finishCreate(file.path, read, remote, findLocalAttachments(doc.text).length === 0);
    }

    /** A document created for this file by an earlier run that never finished: take it over instead of creating again. */
    async function adoptCreated(path: string, read: FileRead, id: string) {
        let remote: OutlineDocument | null;
        try {
            remote = await client.documents.info({ id });
        } catch (error) {
            if (!(error instanceof OutlineApiError) || (error.status !== 403 && error.status !== 404)) {
                throw error;
            }
            remote = null;
        }
        // Outline still answers for a trashed document to whoever may restore it.
        if (remote == null || remote.deletedAt != null) {
            dropPendingCreate(id);
            report.skipped.push({ path, reason: 'The document created for this file is gone from Outline.' });
            return;
        }
        idAtPath.set(path, id);
        await finishCreate(path, read, remote, false);
    }

    /**
     * Puts the id into the file and starts tracking the document. `complete` when Outline holds the whole file, so
     * the file becomes Outline's version right away; otherwise the rest (attachments, edits made since) is sent now.
     */
    async function finishCreate(path: string, read: FileRead, remote: OutlineDocument, complete: boolean) {
        const { doc } = parseDocFile(read.content, basename(path));
        const written = complete
            ? serializeDocFile({ ...doc, id: remote.id, title: remote.title, text: toLocalLinks(remote.text) })
            : serializeDocFile({ ...doc, id: remote.id });
        if (written !== read.content && !(await writeIfUnchanged(path, read.hash, written))) {
            return;
        }
        const base = localContent(remote, doc.extra);
        await store.writeBase(remote.id, base);
        const writtenHash = contentHash(written);
        state.documents[remote.id] = {
            id: remote.id,
            path,
            revision: remote.revision,
            title: remote.title,
            parentId: remote.parentDocumentId,
            collectionId: remote.collectionId,
            localHash: complete ? writtenHash : contentHash(base),
        };
        dropPendingCreate(remote.id);
        if (!complete) {
            const linked = await uploadAttachments(
                path,
                remote.id,
                { content: written, hash: writtenHash, invalid: false },
                base,
            );
            if (linked != null) {
                await sendContent(path, remote.id, linked.content, linked.hash);
            }
        }
    }

    /** Follows a file to its new place: a rename needs nothing, a new folder is a `documents.move`. */
    async function placeDocument(path: string, known: DocState) {
        if (path === known.path) {
            return;
        }
        // The state follows the file even when Outline cannot: the next full pull then moves it back where it belongs.
        state.documents[known.id] = { ...known, path };
        if (dirname(path) === dirname(known.path)) {
            report.moved.push({ from: known.path, to: path });
            return;
        }
        const placement = placementOf(path);
        const wasDraft = known.path.startsWith(`${DRAFTS_FOLDER}/`);
        if (placement.kind === 'refused') {
            report.skipped.push({ path, reason: `Not moved in Outline: ${placement.reason}` });
            return;
        }
        if ((placement.kind === 'draft') !== wasDraft) {
            report.skipped.push({
                path,
                reason: 'Not moved in Outline: moving a file into or out of drafts/ does not publish or unpublish it.',
            });
            return;
        }
        if (
            placement.kind === 'draft' ||
            (placement.collectionId === known.collectionId && placement.parentId === known.parentId)
        ) {
            report.moved.push({ from: known.path, to: path });
            return;
        }
        const result = await client.documents.move({
            id: known.id,
            collectionId: placement.collectionId,
            parentDocumentId: placement.parentId,
        });
        for (const moved of result.documents) {
            const tracked = state.documents[moved.id];
            if (tracked != null) {
                state.documents[moved.id] = {
                    ...tracked,
                    collectionId: moved.collectionId,
                    parentId: moved.parentDocumentId,
                };
            }
        }
        report.moved.push({ from: known.path, to: path });
    }

    async function syncContent(file: LocalFile, read: FileRead, id: string) {
        const known = state.documents[id];
        assert(known != null, `Document ${id} is not tracked`);
        if (read.hash === known.localHash) {
            const current: DocState = { ...known };
            // A conflict resolved by keeping Outline's version leaves the file at `localHash`: it is resolved all the same.
            if (!hasConflictMarkers(read.content)) {
                delete current.conflictRevision;
            }
            state.documents[id] = current;
            return;
        }
        if (hasConflictMarkers(read.content)) {
            report.conflicts.push(file.path);
            return;
        }
        const linked = await uploadAttachments(file.path, id, read, (await store.readBase(id)) ?? '');
        if (linked != null) {
            await sendContent(file.path, id, linked.content, linked.hash);
        }
    }

    /**
     * Sends the file unless Outline already has its title and text; on 409 merges Outline's latest version in
     * first (conflict markers when the same paragraph changed) and retries once.
     */
    async function sendContent(path: string, id: string, content: string, startHash: string) {
        const known = state.documents[id];
        assert(known != null, `Document ${id} is not tracked`);
        const base = await store.readBase(id);
        const baseDoc = base == null ? null : parseDocFile(base, basename(path)).doc;
        if (baseDoc != null && sameText(baseDoc, parseDocFile(content, basename(path)).doc)) {
            // Only the frontmatter changed, or the file is back to what Outline has: nothing to send.
            await settle(
                path,
                id,
                { content, startHash },
                {
                    title: baseDoc.title,
                    text: baseDoc.text,
                    revision: known.revision,
                    collectionId: known.collectionId,
                    parentId: known.parentId,
                },
            );
            return;
        }

        let sending = content;
        let lastRevision = known.revision;
        for (let attempt = 0; ; attempt++) {
            const { doc } = parseDocFile(sending, basename(path));
            try {
                const remote = await client.documents.update({
                    id,
                    title: doc.title,
                    text: toOutlineLinks(doc.text),
                    lastRevision,
                });
                await settle(path, id, { content: sending, startHash }, agreedFrom(remote));
                report.updated.push(path);
                return;
            } catch (error) {
                if (!(error instanceof OutlineConflictError)) {
                    throw error;
                }
                if (attempt > 0) {
                    report.skipped.push({ path, reason: 'Outline kept changing during the push; sent next time.' });
                    return;
                }
            }

            const latest = await client.documents.info({ id });
            const extra = parseDocFile(base ?? content, basename(path)).doc.extra;
            const theirs = localContent(latest, extra);
            const merged = await mergeDocument({
                ours: content,
                base: base ?? '',
                theirs,
                theirsAuthor: latest.updatedBy.name,
            });
            if (merged.conflict) {
                await recordConflict(path, id, startHash, merged.content, latest, theirs);
                return;
            }
            const mergedDoc = parseDocFile(merged.content, basename(path)).doc;
            if (sameText(mergedDoc, parseDocFile(theirs, basename(path)).doc)) {
                await settle(path, id, { content: merged.content, startHash }, agreedFrom(latest));
                return;
            }
            sending = merged.content;
            lastRevision = latest.revision;
        }
    }

    /** As the pull does: markers in the file, Outline's version as the base, so the resolved file merges again. */
    async function recordConflict(
        path: string,
        id: string,
        startHash: string,
        content: string,
        latest: OutlineDocument,
        theirs: string,
    ) {
        if (!(await writeIfUnchanged(path, startHash, content))) {
            return;
        }
        await store.writeBase(id, theirs);
        const known = state.documents[id];
        assert(known != null, `Document ${id} is not tracked`);
        state.documents[id] = {
            ...known,
            revision: latest.revision,
            title: latest.title,
            collectionId: latest.collectionId,
            parentId: latest.parentDocumentId,
            localHash: contentHash(theirs),
            conflictRevision: latest.revision,
        };
        report.conflicts.push(path);
    }

    /**
     * Makes `agreed` the base and the file's content (keeping the file's other frontmatter keys), the
     * file only while it still hashes to `startHash`. `localHash` is the agreed content's hash either way, so an
     * edit made meanwhile reads as a change and is sent next time.
     */
    async function settle(path: string, id: string, file: { content: string; startHash: string }, agreed: Agreed) {
        const known = state.documents[id];
        assert(known != null, `Document ${id} is not tracked`);
        const { doc } = parseDocFile(file.content, basename(path));
        const local = serializeDocFile({ ...doc, id, title: agreed.title, text: agreed.text });
        await store.writeBase(id, local);

        const absolute = join(documentsDir, path);
        const current = await readFileIfExists(absolute);
        const localHash = contentHash(local);
        if (current != null && contentHash(current) === file.startHash) {
            if (current.toString('utf8') !== local) {
                await writeFileAtomic(absolute, local);
            }
        } else {
            report.skipped.push({ path, reason: 'The file changed while the push ran; sent next time.' });
        }
        const resolved: DocState = { ...known };
        delete resolved.conflictRevision;
        state.documents[id] = {
            ...resolved,
            revision: agreed.revision,
            title: agreed.title,
            collectionId: agreed.collectionId,
            parentId: agreed.parentId,
            localHash,
        };
    }

    /**
     * Uploads the local files the document links to and points the links at them (`_attachments/<id>-<name>`, the
     * files copied to match). `null` when the file changed meanwhile or an upload failed: it is pushed next time.
     * Only links the local side added are uploaded: a link already in `base` (Outline's version, which every pull,
     * merge and conflict writes) came from Outline, where anyone with access may have pointed it at any local file.
     */
    async function uploadAttachments(path: string, documentId: string, read: FileRead, base: string) {
        const fromOutline = new Set(findLocalAttachments(base).map(ref => ref.path));
        const refs = findLocalAttachments(read.content).filter(ref => !fromOutline.has(ref.path));
        if (refs.length === 0) {
            return read;
        }
        const folder = dirname(join(documentsDir, path));
        const uploaded = new Map<string, string>();
        const sources = new Map<string, string>();
        let failed = false;
        for (const ref of refs) {
            if (sources.has(ref.path)) {
                continue;
            }
            const source = resolve(folder, ref.path);
            sources.set(ref.path, source);
            if (!isInside(documentsDir, source)) {
                report.skipped.push({ path, reason: `${ref.path} is outside the documents folder; not uploaded.` });
                continue;
            }
            const bytes = await readFileIfExists(source);
            if (bytes == null) {
                report.skipped.push({ path, reason: `${ref.path} does not exist; the link was sent as it is.` });
                continue;
            }
            const name = basename(source);
            const contentType = Bun.file(source).type;
            const upload = await client.attachments.create({
                name,
                size: bytes.byteLength,
                contentType,
                documentId,
            });
            const form = new FormData();
            for (const [key, value] of Object.entries(upload.form)) {
                form.append(key, value);
            }
            // Storage reads the fields before the file, so the file goes last.
            form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), name);
            try {
                const response = await uploadFile(upload.uploadUrl, form);
                if (!response.ok) {
                    throw new Error(`the storage answered ${response.status}`);
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'unknown error';
                report.skipped.push({ path, reason: `Uploading ${ref.path} failed (${reason}); retried next time.` });
                failed = true;
                continue;
            }
            uploaded.set(ref.path, upload.attachment.id);
            report.attachmentsUploaded.push(relative(documentsDir, source));
        }
        if (uploaded.size === 0) {
            return failed ? null : read;
        }

        const content = linkUploadedAttachments(read.content, uploaded);
        if (!(await writeIfUnchanged(path, read.hash, content))) {
            return null;
        }
        // A missing file is downloaded by the next pull, so the links are written first.
        const linked = findOutlineAttachments(content);
        for (const [target, attachmentId] of uploaded) {
            const source = sources.get(target);
            assert(source != null, `No source for ${target}`);
            for (const attachment of linked.filter(candidate => candidate.id === attachmentId)) {
                const destination = join(folder, attachment.path);
                if (!(await pathExists(destination))) {
                    await mkdir(dirname(destination), { recursive: true });
                    await copyFile(source, destination);
                }
            }
            // A file in `_attachments/` is sync's own and goes once nothing links it; the user's files elsewhere stay.
            if (relative(folder, source).startsWith(`${ATTACHMENTS_FOLDER}/`)) {
                uploadedSources.add(source);
            }
        }
        return failed ? null : { content, hash: contentHash(content) };
    }

    /** Removes the uploaded `_attachments/` files no document links any more (each document got its own copy). */
    async function removeUploadedSources() {
        if (uploadedSources.size === 0) {
            return;
        }
        for (const path of await listMarkdownFiles(documentsDir)) {
            const content = await readTextIfExists(join(documentsDir, path));
            const folder = dirname(join(documentsDir, path));
            for (const ref of findLocalAttachments(content ?? '')) {
                uploadedSources.delete(resolve(folder, ref.path));
            }
        }
        for (const source of uploadedSources) {
            await rm(source, { force: true });
        }
    }

    /**
     * Deepest first, so a deleted subtree is archived child by child. A parent with children left (with files, or in
     * Outline only) stays.
     */
    async function archiveVanished(vanished: DocState[], present: Set<string>) {
        for (const document of vanished.toSorted(
            (a, b) => pathDepth(b.path) - pathDepth(a.path) || a.path.localeCompare(b.path),
        )) {
            if (now() >= deadline) {
                report.stoppedAtDeadline = true;
                return;
            }
            try {
                // Outline's children too: one added there since the last pull is not in the state yet.
                const remoteChildren = await client.documents.list({
                    filters: [{ field: 'parentDocumentId', operator: 'eq', value: document.id }],
                    limit: 100,
                });
                const children = new Set([
                    ...Object.values(state.documents)
                        .filter(child => child.parentId === document.id && present.has(child.id))
                        .map(child => child.path),
                    ...remoteChildren.data.map(
                        child => state.documents[child.id]?.path ?? `"${child.title}" (only in Outline)`,
                    ),
                ]);
                if (children.size > 0) {
                    report.skipped.push({
                        path: document.path,
                        reason: `Not archived: archiving it would archive ${[...children].join(', ')} too.`,
                    });
                    continue;
                }
                await client.documents.archive({ id: document.id });
                report.archived.push(document.path);
            } catch (error) {
                if (!(error instanceof OutlineApiError)) {
                    throw error;
                }
                report.skipped.push({ path: document.path, reason: `Not archived: ${error.message}` });
                // Outline refused for good (a draft, no permission) or the document is gone: stop tracking it, so the
                // next full pull brings the file back if it is still there. Anything else is retried.
                if (![400, 403, 404].includes(error.status)) {
                    continue;
                }
            }
            delete state.documents[document.id];
            await store.deleteBase(document.id);
        }
    }

    function placementOf(path: string): Placement {
        const segments = path.split('/');
        const [top = ''] = segments;
        if (segments.length === 1) {
            return privateCollectionId == null
                ? { kind: 'refused', reason: 'Your private Outline collection was not found.' }
                : { kind: 'collection', collectionId: privateCollectionId, parentId: null };
        }
        if (top === DRAFTS_FOLDER) {
            return segments.length === 2
                ? { kind: 'draft' }
                : { kind: 'refused', reason: `Drafts sit directly in ${DRAFTS_FOLDER}/, not in its sub-folders.` };
        }
        if (top === SHARED_FOLDER) {
            return {
                kind: 'refused',
                reason: `${SHARED_FOLDER}/ holds other people's documents; nothing is created there.`,
            };
        }
        const collectionId = collectionByFolder.get(top);
        if (collectionId == null) {
            return { kind: 'refused', reason: `The folder ${top}/ is not an Outline collection.` };
        }
        if (segments.length === 2) {
            return { kind: 'collection', collectionId, parentId: null };
        }
        const parentPath = `${segments.slice(0, -1).join('/')}.md`;
        const parentId = idAtPath.get(parentPath);
        if (parentId == null) {
            return { kind: 'refused', reason: `The folder has no document ${parentPath} in Outline to sit under.` };
        }
        return { kind: 'collection', collectionId, parentId };
    }

    /** Writes `content` unless the file was edited meanwhile (it hashes differently from `startHash`); then it waits for the next push. */
    async function writeIfUnchanged(path: string, startHash: string, content: string) {
        const written = await writeFileIfUnchanged(join(documentsDir, path), startHash, content);
        if (!written) {
            report.skipped.push({ path, reason: 'The file changed while the push ran; sent next time.' });
        }
        return written;
    }

    function dropPendingCreate(id: string) {
        for (const [path, pending] of Object.entries(state.pendingCreates)) {
            if (pending === id) {
                delete state.pendingCreates[path];
            }
        }
    }
}

/**
 * Why no file may be archived in this run, or `null`. Up to `SMALL_DELETE` deletions pass (an agent tidying a few
 * files); a bigger batch passes while it is at most half of the tracked files (a folder of a large workspace).
 * More than half at once, or every tracked file once there were two or more, looks like a wiped or swapped folder
 * rather than an edit. Refusing costs only a delay; archiving a whole workspace by accident costs the partners
 * their documents' place in Outline.
 */
function archiveRefusal(vanished: number, tracked: number): string | null {
    if ((vanished > SMALL_DELETE && vanished * 2 > tracked) || (vanished >= 2 && vanished === tracked)) {
        return `${vanished} of ${tracked} tracked files are missing at once; nothing was archived.`;
    }
    return null;
}

async function checkFolder(documentsDir: string) {
    try {
        const folder = await stat(documentsDir);
        return folder.isDirectory() ? null : 'The documents folder is not a folder; nothing was archived.';
    } catch (error) {
        if (isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR')) {
            return 'The documents folder is missing (a broken link or a moved checkout?); nothing was archived.';
        }
        throw error;
    }
}

/** Every `.md` file under `root`, relative with `/`; hidden entries, symlinks and `_attachments/` folders are skipped. */
async function listMarkdownFiles(root: string, folder = ''): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
        const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
        if (entry.name.startsWith('.') || entry.name === ATTACHMENTS_FOLDER) {
            continue;
        }
        if (entry.isDirectory()) {
            found.push(...(await listMarkdownFiles(root, path)));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            found.push(path);
        }
    }
    return found;
}

function sameText(a: DocFile, b: DocFile) {
    return a.title === b.title && a.text === b.text;
}

function agreedFrom(remote: OutlineDocument): Agreed {
    return {
        title: remote.title,
        text: toLocalLinks(remote.text),
        revision: remote.revision,
        collectionId: remote.collectionId,
        parentId: remote.parentDocumentId,
    };
}
