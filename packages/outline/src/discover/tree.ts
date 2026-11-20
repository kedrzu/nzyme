import { pickFreeName, slugify } from '../doc/naming.js';
import type { DocState } from '../state/StateStore.js';

/** Folder for the user's own drafts, which belong to no collection. */
export const DRAFTS_FOLDER = 'drafts';
/** Folder for documents shared with the user whose collection or parent the user cannot see. */
export const SHARED_FOLDER = 'shared-with-me';

const RESERVED_ROOT_FOLDERS = [DRAFTS_FOLDER, SHARED_FOLDER];

/** What path assignment needs to know about a document, from Outline or from the sync state. */
export interface TreeDocument {
    id: string;
    title: string;
    collectionId: string | null;
    parentId: string | null;
    /** A draft (not published) lives in `drafts/` whatever its collection. */
    published: boolean;
    /** When two new documents want the same name, the older one gets it; a known document keeps its own. */
    createdAt?: string;
}

export interface TreeInput {
    /** Every document the paths are needed for; a parent missing from here counts as not visible. */
    documents: TreeDocument[];
    /** Collections the user can see, by id; a document in any other one was reached by a share. */
    collections: { id: string; name: string }[];
    /** The names assigned so far: `documents` and `collections` of the sync state, and its private collection. */
    state: {
        documents: Record<string, Pick<DocState, 'path'>>;
        collections: Record<string, string>;
        privateCollectionId?: string;
    };
}

export interface TreeResult {
    /** Relative path (`folder/name.md`) per document id. */
    paths: Map<string, string>;
    /** The collection folder names: the state's, plus any newly assigned. */
    collections: Record<string, string>;
}

/**
 * Maps Outline's structure onto relative paths, keeping every name already assigned: a document keeps its file
 * name and a collection its folder name whatever happens to the title in Outline, and only the folder follows a
 * move. New documents and collections get a free name from their title; every collection in `input.collections`
 * gets a folder, empty ones too. A document with children has them in a
 * folder named like its file without `.md`.
 *
 * A top-level document of the private collection whose file sits at the top of the documents folder (where push
 * creates such files) stays there; the collection's folder holds its other documents.
 *
 * A name an existing document keeps is never given to another document, even one that has since left the
 * folder or lost access: its file may still be on disk. The one exception to "names never change" is a moved
 * document whose own name is already taken in the new folder; it gets a `-2` style suffix.
 */
export function assignPaths(input: TreeInput): TreeResult {
    const byId = new Map(input.documents.map(document => [document.id, document]));
    const visibleCollections = new Map(input.collections.map(collection => [collection.id, collection.name]));
    const collections = { ...input.state.collections };

    // Folder (lowercase) to claimed file names (lowercase) to the claimant id.
    const claims = new Map<string, Map<string, string>>();
    const claim = (folder: string, fileName: string, id: string) => {
        const key = folder.toLowerCase();
        const names = claims.get(key) ?? new Map<string, string>();
        names.set(fileName.toLowerCase(), id);
        claims.set(key, names);
    };
    for (const [id, state] of Object.entries(input.state.documents)) {
        const { folder, fileName } = splitPath(state.path);
        claim(folder, fileName, id);
    }

    // A document at the top keeps its children in a folder named like it, which no collection may take.
    const collectionFolders = new Set([
        ...RESERVED_ROOT_FOLDERS,
        ...Object.values(collections),
        ...Object.values(input.state.documents).flatMap(({ path }) =>
            path.includes('/') ? [] : [path.slice(0, -'.md'.length)],
        ),
    ]);
    const collectionFolder = (collectionId: string) => {
        const existing = collections[collectionId];
        if (existing != null) {
            return existing;
        }
        const name = visibleCollections.get(collectionId) ?? '';
        const folder = pickFreeName(slugify(name, 'collection'), collectionFolders);
        collectionFolders.add(folder);
        collections[collectionId] = folder;
        return folder;
    };

    const paths = new Map<string, string>();
    const ordered = input.documents.toSorted(
        (a, b) =>
            Number(input.state.documents[b.id] != null) - Number(input.state.documents[a.id] != null) ||
            (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
            a.id.localeCompare(b.id),
    );

    const resolving = new Set<string>();
    const resolve = (document: TreeDocument): string => {
        const done = paths.get(document.id);
        if (done != null) {
            return done;
        }
        const folder = folderOf(document, resolving);
        const existing = input.state.documents[document.id];
        const wanted = existing == null ? `${slugify(document.title)}.md` : splitPath(existing.path).fileName;
        const names = claims.get(folder.toLowerCase());
        const owner = names?.get(wanted.toLowerCase());
        const fileName =
            owner == null || owner === document.id
                ? wanted
                : pickFreeName(wanted.slice(0, -'.md'.length), names?.keys() ?? [], '.md');
        claim(folder, fileName, document.id);
        const path = folder === '' ? fileName : `${folder}/${fileName}`;
        paths.set(document.id, path);
        return path;
    };

    const folderOf = (document: TreeDocument, active: Set<string>): string => {
        if (!document.published) {
            return DRAFTS_FOLDER;
        }
        const parent = document.parentId == null ? undefined : byId.get(document.parentId);
        if (parent != null && parent.published && !active.has(parent.id)) {
            active.add(document.id);
            const parentPath = resolve(parent);
            active.delete(document.id);
            return parentPath.slice(0, -'.md'.length);
        }
        const known = input.state.documents[document.id];
        if (
            document.parentId == null &&
            document.collectionId != null &&
            document.collectionId === input.state.privateCollectionId &&
            known != null &&
            !known.path.includes('/')
        ) {
            return '';
        }
        if (
            document.collectionId != null &&
            (visibleCollections.has(document.collectionId) || collections[document.collectionId] != null)
        ) {
            return collectionFolder(document.collectionId);
        }
        return SHARED_FOLDER;
    };

    for (const document of ordered) {
        resolve(document);
    }
    // An empty collection has no document to bring its folder; it still needs one (push creates files there).
    for (const collection of input.collections) {
        collectionFolder(collection.id);
    }
    return { paths, collections };
}

function splitPath(path: string) {
    const slash = path.lastIndexOf('/');
    return slash === -1
        ? { folder: '', fileName: path }
        : { folder: path.slice(0, slash), fileName: path.slice(slash + 1) };
}
