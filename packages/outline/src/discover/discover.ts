import { OutlineApiError } from '../outline/errors.js';
import { listAll } from '../outline/listAll.js';
import type { OutlineClient } from '../outline/OutlineClient.js';
import type {
    OutlineCollection,
    OutlineDocument,
    OutlineFilter,
    OutlinePage,
    OutlinePageParams,
} from '../outline/OutlineTypes.js';

const PAGE_SIZE = 100;
/** The incremental pass looks this far before the cursor, so a document saved just before it was read is not missed. */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;

export interface IncrementalDiscovery {
    /** Documents the user can see that changed since the cursor (minus the overlap), drafts included; may repeat ones already pulled. */
    documents: OutlineDocument[];
    /** Every collection the user can read, fetched only when a changed document needs one placed (see `discoverIncremental`); otherwise empty. */
    collections: OutlineCollection[];
    /** The latest `updatedAt` seen; never earlier than the cursor passed in. */
    cursor: string | null;
}

export interface FullDiscovery {
    /** Every document the user can see, once each: collections, own drafts, direct and group shares. A known id missing here is confirmed archived, deleted, or out of reach. */
    documents: OutlineDocument[];
    collections: OutlineCollection[];
    cursor: string | null;
}

export interface IncrementalOptions {
    /** The saved cursor; `null` lists everything. */
    cursor: string | null;
    /** Collections whose folders are already assigned. */
    knownCollectionIds: Iterable<string>;
    /** The collection of each document already synced, by id. */
    knownDocuments: Readonly<Record<string, { collectionId: string | null }>>;
}

/**
 * The cheap pass run at a prompt: one request when nothing changed. A query-less `documents.search` for what
 * changed since the cursor, newest first, read only as far back as the cursor; unlike `documents.list` it also
 * covers the user's drafts and documents shared with the user (directly, through a group, or under a shared
 * parent) in a collection the user cannot read. It cannot see archiving, deletion, lost access or a new share
 * (none moves `updatedAt`); the full pass does.
 *
 * A `collections.list` follows only when a published document is new or moved into a collection without a
 * folder, not for a synced one from a collection the user cannot read, which would otherwise bring it at every
 * edit.
 */
export async function discoverIncremental(
    client: OutlineClient,
    options: IncrementalOptions,
): Promise<IncrementalDiscovery> {
    const since =
        options.cursor == null ? null : new Date(Date.parse(options.cursor) - CURSOR_OVERLAP_MS).toISOString();
    const filters: OutlineFilter[] = [{ field: 'archivedAt', operator: 'isNull' }];
    if (since != null) {
        filters.push({ field: 'updatedAt', operator: 'gt', value: since });
    }
    const results = await listAll(page =>
        client.documents.search({ ...page, sort: 'updatedAt', direction: 'DESC', filters }),
    );
    const documents = dedupe(results.map(result => result.document));

    const known = new Set(options.knownCollectionIds);
    const needsCollections = documents.some(
        document =>
            document.publishedAt != null &&
            document.collectionId != null &&
            !known.has(document.collectionId) &&
            options.knownDocuments[document.id]?.collectionId !== document.collectionId,
    );
    const collections = needsCollections ? await listAll(page => client.collections.list(page)) : [];
    return { documents, collections, cursor: advanceCursor(options.cursor, documents) };
}

export interface FullOptions {
    /** The saved cursor. */
    cursor: string | null;
    /** Documents already synced; one the listing missed is looked up on its own before it counts as gone. */
    knownIds: Iterable<string>;
}

/**
 * Every document the token can see: one listing of the documents in the collections the user can read, the
 * user's drafts, and the roots shared with the user directly or through a group, walking down the subtree of a
 * root the listing did not already cover. A known document the listing missed is looked up with
 * `documents.info`: paged lists can skip a document edited mid-walk, and a just-created collection can be
 * invisible to the listing for a minute.
 */
export async function discoverFull(client: OutlineClient, options: FullOptions): Promise<FullDiscovery> {
    const found = new Map<string, OutlineDocument>();
    const add = (document: OutlineDocument) => {
        if (document.archivedAt == null && document.deletedAt == null && !found.has(document.id)) {
            found.set(document.id, document);
        }
    };

    const collections = await listAll(page => client.collections.list(page));
    for (const document of await listAll(page => client.documents.list(page))) {
        add(document);
    }
    for (const document of await listAll(page => client.documents.drafts(page))) {
        add(document);
    }

    const sharedRoots = [
        ...(await listSharedRoots(page => client.userMemberships.list(page))),
        ...(await listSharedRoots(page => client.groupMemberships.list(page))),
    ];
    for (const root of sharedRoots) {
        if (!found.has(root.id)) {
            add(root);
            await walkSubtree(client, root, add);
        }
    }

    for (const id of options.knownIds) {
        if (!found.has(id)) {
            const document = await findDocument(client, id);
            if (document != null) {
                add(document);
            }
        }
    }

    const documents = [...found.values()];
    return { documents, collections, cursor: advanceCursor(options.cursor, documents) };
}

/** The document, or `null` when Outline refuses it; one in the trash comes back with `deletedAt` set, which `add` drops. */
async function findDocument(client: OutlineClient, id: string) {
    try {
        return await client.documents.info({ id });
    } catch (error) {
        if (error instanceof OutlineApiError && (error.status === 403 || error.status === 404)) {
            return null;
        }
        throw error;
    }
}

/** Roots from a membership endpoint, which pages like the rest but answers without the paging block. */
async function listSharedRoots(
    fetchPage: (page: Required<OutlinePageParams>) => Promise<{ documents: OutlineDocument[] }>,
) {
    const roots: OutlineDocument[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { documents } = await fetchPage({ limit: PAGE_SIZE, offset });
        roots.push(...documents);
        if (documents.length < PAGE_SIZE) {
            return roots;
        }
    }
}

/** A share reaches the whole subtree, which the membership list does not include. */
async function walkSubtree(client: OutlineClient, root: OutlineDocument, add: (document: OutlineDocument) => void) {
    const pending = [root.id];
    const visited = new Set(pending);
    for (let id = pending.shift(); id != null; id = pending.shift()) {
        const parentId = id;
        const children = await listAll((page): Promise<OutlinePage<OutlineDocument>> =>
            client.documents.list({
                ...page,
                filters: [{ field: 'parentDocumentId', operator: 'eq', value: parentId }],
            }),
        );
        for (const child of children) {
            add(child);
            if (!visited.has(child.id)) {
                visited.add(child.id);
                pending.push(child.id);
            }
        }
    }
}

function dedupe(documents: OutlineDocument[]) {
    return [...new Map(documents.map(document => [document.id, document])).values()];
}

/** The latest `updatedAt` among `documents` and `cursor`; unchanged when nothing is later. */
function advanceCursor(cursor: string | null, documents: OutlineDocument[]) {
    let latest = cursor;
    for (const { updatedAt } of documents) {
        if (latest == null || Date.parse(updatedAt) > Date.parse(latest)) {
            latest = updatedAt;
        }
    }
    return latest;
}
