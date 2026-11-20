import type { OutlineClient } from '../outline/OutlineClient.js';
import { listAll } from '../outline/listAll.js';
import type {
    OutlineCollection,
    OutlineDocument,
    OutlineNavigationNode,
    OutlinePage,
    OutlinePageParams,
} from '../outline/OutlineTypes.js';

const PAGE_SIZE = 100;
/** The incremental pass looks this far before the cursor, so a document saved just before it was read is not missed. */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;

export interface IncrementalDiscovery {
    /** Documents the user can see that changed since the cursor (minus the overlap), drafts included; may repeat ones already pulled. */
    documents: OutlineDocument[];
    /** Collections of the changed documents, fetched only when one of them was not in `knownCollectionIds`; otherwise empty. */
    collections: OutlineCollection[];
    /** The latest `updatedAt` seen; never earlier than the cursor passed in. */
    cursor: string | null;
}

export interface FullDiscovery {
    /** Every document the user can see, once each: collections, own drafts, direct and group shares. A known id missing here was archived, deleted, or lost. */
    documents: OutlineDocument[];
    collections: OutlineCollection[];
    /** Document id to its position in Outline's order (collection trees first, then shared subtrees). */
    order: Map<string, number>;
    cursor: string | null;
}

export interface IncrementalOptions {
    /** The saved cursor; `null` lists everything. */
    cursor: string | null;
    /** Collections whose folders are already assigned; an unlisted one triggers a `collections.list`. */
    knownCollectionIds: Iterable<string>;
}

/**
 * The cheap pass run at every prompt: two requests when nothing changed. `documents.list` filtered by
 * `updatedAt` plus the user's own drafts (which `documents.list` omits), read only as far back as the cursor.
 * It cannot see archiving, deletion or lost access; the full pass does.
 */
export async function discoverIncremental(
    client: OutlineClient,
    options: IncrementalOptions,
): Promise<IncrementalDiscovery> {
    const since =
        options.cursor == null ? null : new Date(Date.parse(options.cursor) - CURSOR_OVERLAP_MS).toISOString();
    const published = await listAll(page =>
        client.documents.list({
            ...page,
            filters: since == null ? [] : [{ field: 'updatedAt', operator: 'gt', value: since }],
        }),
    );
    const drafts = await listDraftsSince(client, since);
    const documents = dedupe([...published, ...drafts]);

    const known = new Set(options.knownCollectionIds);
    const needsCollections = documents.some(
        document => document.publishedAt != null && document.collectionId != null && !known.has(document.collectionId),
    );
    const collections = needsCollections ? await listAll(page => client.collections.list(page)) : [];
    return { documents, collections, cursor: advanceCursor(options.cursor, documents) };
}

/**
 * Every document the token can see. Reads each visible collection (its documents and its tree), the user's
 * drafts, and the roots shared with the user directly or through a group, walking down the subtree of a root
 * that no visible collection already covers. A just-created collection can be invisible for a minute; the next
 * full pass has it.
 */
export async function discoverFull(client: OutlineClient, cursor: string | null): Promise<FullDiscovery> {
    const found = new Map<string, OutlineDocument>();
    const order = new Map<string, number>();
    const add = (document: OutlineDocument) => {
        if (document.archivedAt == null && !found.has(document.id)) {
            found.set(document.id, document);
        }
    };

    const collections = await listAll(page => client.collections.list(page));
    for (const collection of collections) {
        const inCollection = await listAll(page =>
            client.documents.list({
                ...page,
                filters: [{ field: 'collectionId', operator: 'eq', value: collection.id }],
            }),
        );
        inCollection.forEach(add);
        recordOrder(await client.collections.documents({ id: collection.id }), order);
    }

    (await listAll(page => client.documents.drafts(page))).forEach(add);

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

    const documents = [...found.values()];
    for (const document of documents) {
        if (!order.has(document.id)) {
            order.set(document.id, order.size);
        }
    }
    return { documents, collections, order, cursor: advanceCursor(cursor, documents) };
}

/** Own drafts, newest first, read only until one older than `since` (all of them without it). */
async function listDraftsSince(client: OutlineClient, since: string | null) {
    const drafts: OutlineDocument[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await client.documents.drafts({ limit: PAGE_SIZE, offset });
        const recent = page.data.filter(draft => since == null || draft.updatedAt > since);
        drafts.push(...recent);
        if (page.data.length < PAGE_SIZE || recent.length < page.data.length) {
            return drafts;
        }
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

function recordOrder(nodes: OutlineNavigationNode[], order: Map<string, number>) {
    for (const node of nodes) {
        if (!order.has(node.id)) {
            order.set(node.id, order.size);
        }
        recordOrder(node.children, order);
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
