import { arrayRemoveWhere } from '@nzyme/utils/array/arrayRemoveWhere.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import { OutlineClient } from './OutlineClient.js';
import type { OutlineClientOptions, OutlineFetch } from './OutlineClient.js';
import type {
    OutlineCollection,
    OutlineCollectionPermission,
    OutlineDocument,
    OutlineDocumentGroupMembership,
    OutlineDocumentMembership,
    OutlineFilter,
    OutlineFilterField,
    OutlineFilterOperator,
    OutlineGroup,
    OutlinePagination,
    OutlinePermission,
    OutlineUser,
} from './OutlineTypes.js';

export interface FakeOutlineOptions {
    /** Base URL the fake answers for; defaults to `https://outline.test`. */
    url?: string;
    /**
     * Stands in for Outline's Markdown round trip (ProseMirror parse and re-serialize), applied to every
     * `text` written through the API. Identity by default.
     */
    normalizeText?: (text: string) => string;
}

/**
 * A simplified stand-in for the Markdown normalization observed in Outline Cloud, for `normalizeText`:
 * `- ` bullets become `* `; table separator rows are rebuilt with dashes sized to the header cells; `_italic_`
 * becomes `*italic*` (`__bold__` stays); a hard break (two trailing spaces and a newline inside a paragraph)
 * becomes a literal backslash-n joining the lines; a line starting with `---` followed by text becomes `\---`;
 * runs of three or more newlines collapse to one blank line.
 *
 * It is not the real thing (the real one needs two writes to converge, among other differences): this one is a
 * fixed point after a single application, which is what a sync test needs.
 */
export function outlineLikeNormalizer(text: string): string {
    const lines = text
        .replaceAll(/\n{3,}/g, '\n\n')
        .replaceAll(/(\S) {2,}\n(?=\S)/g, String.raw`$1\n`)
        .split('\n');
    return lines
        .map((line, index) => {
            const header = lines[index - 1] ?? '';
            if (TABLE_SEPARATOR.test(line) && header.includes('|')) {
                const cells = header.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
                return `|${cells.map(cell => '-'.repeat(Math.max(3, cell.length))).join('|')}|`;
            }
            return line.replace(/^(\s*)- /, '$1* ').replace(/^---(?=\s*[^\s-])/, String.raw`\---`);
        })
        .join('\n')
        .replaceAll(/(?<![_\w])_(?!_)([^_\n]+?)(?<!_)_(?![_\w])/g, '*$1*');
}

const TABLE_SEPARATOR = /^\|(\s*:?-{3,}:?\s*\|)+\s*$/;

export interface FakeUser extends OutlineUser {
    /** The bearer token that authenticates as this user. */
    token: string;
}

export interface FakeAddUserParams {
    name: string;
    email?: string;
    isAdmin?: boolean;
}

export interface FakeAddGroupParams {
    name: string;
    members?: FakeUser[];
}

export interface FakeCollectionMember {
    user: FakeUser;
    permission: OutlinePermission;
}

export interface FakeCollectionGroupMember {
    group: OutlineGroup;
    permission: OutlinePermission;
}

export interface FakeAddCollectionParams {
    name: string;
    /** Access for everyone in the workspace; `null` (the default) makes the collection private. */
    permission?: OutlineCollectionPermission;
    members?: FakeCollectionMember[];
    groups?: FakeCollectionGroupMember[];
}

export interface FakeAddDocumentParams {
    title: string;
    text?: string;
    collection?: OutlineCollection;
    /** Nests the document under this one, in its collection. */
    parent?: OutlineDocument;
    /** Defaults to the first user added. */
    createdBy?: FakeUser;
    /** `false` makes a draft. */
    published?: boolean;
}

export interface FakeShareDocumentParams {
    document: OutlineDocument;
    user?: FakeUser;
    group?: OutlineGroup;
    permission: OutlinePermission;
}

export interface FakeRateLimitParams {
    /** How many matching requests answer 429; defaults to 1. */
    times?: number;
    retryAfterSeconds: number;
    /** Only this API method, e.g. `documents.list`; any method by default. */
    method?: string;
}

export interface FakeOutlineRequest {
    method: string;
    /** `null` when the token matched no user. */
    userId: string | null;
    body: unknown;
}

/** An in-memory Outline that answers the same HTTP calls as the real API, for tests. */
export interface FakeOutline {
    readonly url: string;
    /** Every request received, in order (including ones answered 429). */
    readonly requests: FakeOutlineRequest[];
    /** Authenticates by the `Authorization: Bearer` header, as the real API does. */
    readonly fetch: OutlineFetch;
    /** A fetch that is always this user, whatever token the caller sends. */
    fetchAs(user: FakeUser): OutlineFetch;
    /** A client authenticated as this user with its token. */
    clientAs(user: FakeUser, overrides?: Pick<OutlineClientOptions, 'sleep'>): OutlineClient;
    addUser(params: FakeAddUserParams): FakeUser;
    addGroup(params: FakeAddGroupParams): OutlineGroup;
    addCollection(params: FakeAddCollectionParams): OutlineCollection;
    addDocument(params: FakeAddDocumentParams): OutlineDocument;
    /** Gives a user or a group direct access to one document. */
    shareDocument(params: FakeShareDocumentParams): void;
    /** The current state of a document, including archived ones; `undefined` once deleted. */
    getDocument(id: string): OutlineDocument | undefined;
    /** Makes the next matching requests answer 429 with `Retry-After`. */
    injectRateLimit(params: FakeRateLimitParams): void;
}

type Body = Record<string, unknown>;

interface DocumentRecord {
    id: string;
    title: string;
    text: string;
    collectionId: string | null;
    parentDocumentId: string | null;
    revision: number;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    archivedAt: string | null;
    deletedAt: string | null;
    createdById: string;
    updatedById: string;
}

interface CollectionRecord extends OutlineCollection {
    members: { userId: string; permission: OutlinePermission }[];
    groupMembers: { groupId: string; permission: OutlinePermission }[];
}

interface GroupRecord {
    id: string;
    name: string;
    memberIds: string[];
}

interface AttachmentRecord {
    id: string;
    name: string;
    contentType: string;
    size: number;
    documentId: string;
}

interface RateLimitInjection {
    remaining: number;
    retryAfterSeconds: number;
    method?: string;
}

interface Call {
    user: FakeUser;
    body: Body;
}

type Handler = (call: Call) => Response;

type AccessNeed = 'read' | 'write';

const PERMISSIONS: OutlinePermission[] = ['read', 'read_write', 'admin'];
const FILTER_FIELDS: OutlineFilterField[] = [
    'createdAt',
    'updatedAt',
    'publishedAt',
    'archivedAt',
    'collectionId',
    'parentDocumentId',
];
const DATE_FIELDS: OutlineFilterField[] = ['createdAt', 'updatedAt', 'publishedAt', 'archivedAt'];
const FILTER_OPERATORS: OutlineFilterOperator[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'isNull'];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Creates an in-memory Outline. Build the world with `addUser`, `addCollection`, `addDocument`, then talk to
 * it through `clientAs(user)` or `fetchAs(user)`.
 *
 * The Outline rules it models are in clearly named functions below (`collectionAccess`, `documentAccess`,
 * `matchesFilters`, `listVisibleDocuments`, `searchableDocuments`, the `documents.update` handler for revisions and
 * conflicts), so a behaviour found different on real Outline is corrected in one place.
 */
export function fakeOutline(options: FakeOutlineOptions = {}): FakeOutline {
    const url = (options.url ?? 'https://outline.test').replace(/\/+$/, '');
    const normalizeText = options.normalizeText ?? (text => text);
    const users: FakeUser[] = [];
    const groups: GroupRecord[] = [];
    const collections: CollectionRecord[] = [];
    const documents: DocumentRecord[] = [];
    const documentMemberships: OutlineDocumentMembership[] = [];
    const documentGroupMemberships: OutlineDocumentGroupMembership[] = [];
    const attachments: AttachmentRecord[] = [];
    const requests: FakeOutlineRequest[] = [];
    const rateLimits: RateLimitInjection[] = [];
    let clock = Date.parse('2026-01-01T00:00:00.000Z');

    const handlers: Record<string, Handler> = {
        'auth.info': authInfo,
        'users.list': usersList,
        'groups.list': groupsList,
        'collections.list': collectionsList,
        'collections.memberships': collectionsMemberships,
        'collections.group_memberships': collectionsGroupMemberships,
        'documents.list': documentsList,
        'documents.drafts': documentsDrafts,
        'documents.search': documentsSearch,
        'documents.info': documentsInfo,
        'documents.create': documentsCreate,
        'documents.update': documentsUpdate,
        'documents.move': documentsMove,
        'documents.archive': documentsArchive,
        'documents.delete': documentsDelete,
        'documents.memberships': documentsMemberships,
        'documents.group_memberships': documentsGroupMemberships,
        'documents.add_user': documentsAddUser,
        'documents.remove_user': documentsRemoveUser,
        'documents.add_group': documentsAddGroup,
        'documents.remove_group': documentsRemoveGroup,
        'userMemberships.list': userMembershipsList,
        'groupMemberships.list': groupMembershipsList,
        'attachments.create': attachmentsCreate,
        'attachments.redirect': attachmentsRedirect,
    };

    const fake: FakeOutline = {
        url,
        requests,
        fetch: handleFetch,
        fetchAs,
        clientAs,
        addUser,
        addGroup,
        addCollection,
        addDocument,
        shareDocument,
        getDocument,
        injectRateLimit,
    };
    return fake;

    // --- world building ---

    function addUser(params: FakeAddUserParams) {
        const id = crypto.randomUUID();
        const user: FakeUser = {
            id,
            name: params.name,
            email: params.email ?? `${params.name.toLowerCase().replaceAll(/\s+/g, '.')}@example.test`,
            isAdmin: params.isAdmin ?? false,
            token: `token-${id}`,
        };
        users.push(user);
        return user;
    }

    function addGroup(params: FakeAddGroupParams) {
        const group: GroupRecord = {
            id: crypto.randomUUID(),
            name: params.name,
            memberIds: (params.members ?? []).map(member => member.id),
        };
        groups.push(group);
        return presentGroup(group);
    }

    function addCollection(params: FakeAddCollectionParams) {
        const collection: CollectionRecord = {
            id: crypto.randomUUID(),
            name: params.name,
            permission: params.permission ?? null,
            members: (params.members ?? []).map(member => ({
                userId: member.user.id,
                permission: member.permission,
            })),
            groupMembers: (params.groups ?? []).map(member => ({
                groupId: member.group.id,
                permission: member.permission,
            })),
        };
        collections.push(collection);
        return presentCollection(collection);
    }

    function addDocument(params: FakeAddDocumentParams) {
        const creator = params.createdBy ?? users[0];
        if (creator == null) {
            throw new Error('fakeOutline: add a user before adding documents');
        }
        const parent = params.parent == null ? undefined : requireDocumentRecord(params.parent.id);
        const stamp = tick();
        const record: DocumentRecord = {
            id: crypto.randomUUID(),
            title: params.title,
            text: normalizeText(params.text ?? ''),
            collectionId: parent?.collectionId ?? params.collection?.id ?? null,
            parentDocumentId: parent?.id ?? null,
            revision: 1,
            createdAt: stamp,
            updatedAt: stamp,
            publishedAt: params.published === false ? null : stamp,
            archivedAt: null,
            deletedAt: null,
            createdById: creator.id,
            updatedById: creator.id,
        };
        documents.push(record);
        return presentDocument(record);
    }

    function shareDocument(params: FakeShareDocumentParams) {
        if (params.user != null) {
            upsertUserMembership(params.document.id, params.user.id, params.permission);
        }
        if (params.group != null) {
            upsertGroupMembership(params.document.id, params.group.id, params.permission);
        }
    }

    function getDocument(id: string) {
        const record = documents.find(candidate => candidate.id === id && candidate.deletedAt == null);
        return record == null ? undefined : presentDocument(record);
    }

    function injectRateLimit(params: FakeRateLimitParams) {
        rateLimits.push({
            remaining: params.times ?? 1,
            retryAfterSeconds: params.retryAfterSeconds,
            method: params.method,
        });
    }

    // --- transport ---

    function fetchAs(user: FakeUser): OutlineFetch {
        return (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${user.token}`);
            return handleFetch(input, { ...init, headers });
        };
    }

    function clientAs(user: FakeUser, overrides: Pick<OutlineClientOptions, 'sleep'> = {}) {
        return new OutlineClient({
            url,
            getAccessToken: () => Promise.resolve(user.token),
            fetch: handleFetch,
            ...overrides,
        });
    }

    function handleFetch(input: string, init?: RequestInit) {
        return Promise.resolve(respond(input, init));
    }

    function respond(input: string, init?: RequestInit) {
        const method = new URL(input).pathname.replace(/^\/api\//, '');
        const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '');
        const user = users.find(candidate => candidate.token === token);
        const body = typeof init?.body === 'string' ? parseBody(init.body) : {};
        requests.push({ method, userId: user?.id ?? null, body });

        const injected = rateLimits.find(
            limit => limit.remaining > 0 && (limit.method == null || limit.method === method),
        );
        if (injected != null) {
            injected.remaining -= 1;
            return failure(429, 'rate_limit_exceeded', 'Too many requests', {
                'Retry-After': String(injected.retryAfterSeconds),
            });
        }
        if (user == null) {
            return failure(401, 'authentication_required', 'Authentication required');
        }
        const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
        if (handler == null) {
            return failure(404, 'not_found', `Unknown endpoint ${method}`);
        }
        try {
            return handler({ user, body });
        } catch (error) {
            if (error instanceof FakeApiError) {
                return failure(error.status, error.code, error.message);
            }
            throw error;
        }
    }

    // --- Outline rules: who can see and change what ---

    /** The strongest access `user` has to a collection: workspace-wide permission, direct or via a group. */
    function collectionAccess(user: FakeUser, collectionId: string | null) {
        const collection = collections.find(candidate => candidate.id === collectionId);
        if (collection == null) {
            return null;
        }
        return strongest([
            collection.permission,
            ...collection.members.filter(member => member.userId === user.id).map(member => member.permission),
            ...collection.groupMembers
                .filter(member => userIsInGroup(user, member.groupId))
                .map(member => member.permission),
        ]);
    }

    /** Access granted by a direct share on exactly this document, to the user or one of their groups. */
    function directDocumentAccess(user: FakeUser, document: DocumentRecord) {
        return strongest([
            ...documentMemberships
                .filter(membership => membership.documentId === document.id && membership.userId === user.id)
                .map(membership => membership.permission),
            ...documentGroupMemberships
                .filter(membership => membership.documentId === document.id && userIsInGroup(user, membership.groupId))
                .map(membership => membership.permission),
        ]);
    }

    /** No access to a document in the trash; otherwise as `grantedAccess`. */
    function documentAccess(user: FakeUser, document: DocumentRecord) {
        return document.deletedAt == null ? grantedAccess(user, document) : null;
    }

    /**
     * A draft is visible to its creator and its direct members only. A published document is visible through
     * its collection, or through a direct share on it or on any ancestor (the share reaches the subtree).
     */
    function grantedAccess(user: FakeUser, document: DocumentRecord) {
        if (document.publishedAt == null) {
            return strongest([document.createdById === user.id ? 'admin' : null, directDocumentAccess(user, document)]);
        }
        return strongest([
            collectionAccess(user, document.collectionId),
            ...[document, ...ancestorsOf(document)].map(candidate => directDocumentAccess(user, candidate)),
        ]);
    }

    function authorizeDocument(user: FakeUser, id: string, need: AccessNeed) {
        const document = documents.find(candidate => candidate.id === id && candidate.deletedAt == null);
        if (document == null) {
            throw new FakeApiError(404, 'not_found', 'Document not found');
        }
        requireAccess(documentAccess(user, document), need);
        return document;
    }

    /**
     * Which documents `documents.list` returns: readable ones in a collection the user can read (or the user's own
     * outside any collection), minus drafts and archived unless a filter asks. A share alone does not list a
     * document, except under a `parentDocumentId` filter on a document shared with the user (a share on an
     * ancestor counts: Outline copies it to the subtree), which lifts the collection scope.
     */
    function listVisibleDocuments(user: FakeUser, filters: OutlineFilter[]) {
        const mentions = (field: OutlineFilterField) => filters.some(filter => filter.field === field);
        const parentId = filters.find(filter => filter.field === 'parentDocumentId' && filter.operator === 'eq')?.value;
        const parent = documents.find(candidate => candidate.id === parentId);
        const sharedParent =
            parent != null &&
            [parent, ...ancestorsOf(parent)].some(candidate => directDocumentAccess(user, candidate) != null);
        return documents
            .filter(document => documentAccess(user, document) != null)
            .filter(
                document =>
                    sharedParent ||
                    collectionAccess(user, document.collectionId) != null ||
                    (document.collectionId == null && document.createdById === user.id),
            )
            .filter(document => document.publishedAt != null || mentions('publishedAt'))
            .filter(document => document.archivedAt == null || mentions('archivedAt'))
            .filter(document => matchesFilters(document, filters))
            .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    /**
     * Which documents `documents.search` reaches for a user: any the user holds a share on, the share on an ancestor
     * included (Outline copies it to the subtree; a draft only by its own share, as in `documentAccess`), the user's
     * own outside a collection, published ones in a collection the user can read, and the user's own in one.
     * Archived documents are not excluded.
     */
    function searchableDocuments(user: FakeUser) {
        return documents
            .filter(document => document.deletedAt == null)
            .filter(document => {
                const shared =
                    directDocumentAccess(user, document) != null ||
                    (document.publishedAt != null &&
                        ancestorsOf(document).some(ancestor => directDocumentAccess(user, ancestor) != null));
                const own = document.createdById === user.id;
                const readableCollection = collectionAccess(user, document.collectionId) != null;
                return (
                    shared ||
                    (own && document.collectionId == null) ||
                    (readableCollection && (document.publishedAt != null || own))
                );
            });
    }

    // --- handlers ---

    function authInfo({ user }: Call) {
        return ok({ user: presentUser(user), team: { id: 'team-1', name: 'Fake team' } });
    }

    function usersList({ body }: Call) {
        const query = optionalString(body, 'query')?.toLowerCase();
        const emails = optionalStringArray(body, 'emails');
        const ids = optionalStringArray(body, 'ids');
        const matching = users
            .filter(user => query == null || `${user.name} ${user.email}`.toLowerCase().includes(query))
            .filter(user => emails == null || emails.includes(user.email))
            .filter(user => ids == null || ids.includes(user.id));
        return okPage(body, matching.map(presentUser));
    }

    function groupsList({ body }: Call) {
        return okPage(body, groups.map(presentGroup));
    }

    function collectionsList({ user, body }: Call) {
        const visible = collections.filter(collection => collectionAccess(user, collection.id) != null);
        return okPage(body, visible.map(presentCollection));
    }

    /** Like Outline, listing who is in a collection needs the right to read it. */
    function collectionsMemberships({ user, body }: Call) {
        const collection = requireReadableCollection(user, requireString(body, 'id'));
        const memberships = collection.members.map(member => ({
            id: `${collection.id}:${member.userId}`,
            collectionId: collection.id,
            userId: member.userId,
            permission: member.permission,
        }));
        const { items, pagination } = paginate(body, memberships);
        return ok({ memberships: items, users: items.map(item => presentUser(requireUser(item.userId))) }, pagination);
    }

    function collectionsGroupMemberships({ user, body }: Call) {
        const collection = requireReadableCollection(user, requireString(body, 'id'));
        const memberships = collection.groupMembers.map(member => ({
            id: `${collection.id}:${member.groupId}`,
            collectionId: collection.id,
            groupId: member.groupId,
            permission: member.permission,
        }));
        const { items, pagination } = paginate(body, memberships);
        const shared = groups.filter(group => items.some(membership => membership.groupId === group.id));
        return ok({ groupMemberships: items, groups: shared.map(presentGroup) }, pagination);
    }

    function requireReadableCollection(user: FakeUser, id: string) {
        const collection = requireCollection(id);
        if (collectionAccess(user, id) == null) {
            throw new FakeApiError(404, 'not_found', 'Collection not found');
        }
        return collection;
    }

    function documentsList({ user, body }: Call) {
        const matching = listVisibleDocuments(user, readFilters(body));
        return okPage(body, matching.map(presentDocument));
    }

    function documentsDrafts({ user, body }: Call) {
        const collectionId = optionalString(body, 'collectionId');
        const drafts = documents
            .filter(document => document.createdById === user.id)
            .filter(document => document.publishedAt == null && document.archivedAt == null)
            .filter(document => document.deletedAt == null)
            .filter(document => collectionId == null || document.collectionId === collectionId)
            .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return okPage(body, drafts.map(presentDocument));
    }

    /** Only the query-less search the sync uses; a text query answers 400 rather than a made-up ranking. */
    function documentsSearch({ user, body }: Call) {
        if ((optionalString(body, 'query') ?? '') !== '') {
            throw new FakeApiError(400, 'validation_error', 'The fake Outline does not search by text');
        }
        const sort = optionalString(body, 'sort') ?? 'updatedAt';
        if (sort !== 'updatedAt' && sort !== 'createdAt') {
            invalid('sort', 'updatedAt | createdAt');
        }
        const direction = optionalString(body, 'direction') ?? 'DESC';
        if (direction !== 'ASC' && direction !== 'DESC') {
            invalid('direction', 'ASC | DESC');
        }
        const filters = readFilters(body);
        const matching = searchableDocuments(user)
            .filter(document => matchesFilters(document, filters))
            .toSorted((a, b) => (direction === 'DESC' ? -1 : 1) * a[sort].localeCompare(b[sort]));
        return okPage(
            body,
            matching.map(document => ({ ranking: 0, context: '', document: presentDocument(document) })),
        );
    }

    /**
     * Like Outline, a document in the trash still answers, with `deletedAt` set, to anyone who may restore it
     * (edit rights on it, or the creator of a draft); others get 403.
     */
    function documentsInfo({ user, body }: Call) {
        const id = requireString(body, 'id');
        const trashed = documents.find(candidate => candidate.id === id && candidate.deletedAt != null);
        if (trashed != null) {
            requireAccess(grantedAccess(user, trashed), 'write');
            return ok(presentDocument(trashed));
        }
        return ok(presentDocument(authorizeDocument(user, id, 'read')));
    }

    /** An `id` the caller chose is kept, as Outline does; one already taken is refused. */
    function documentsCreate({ user, body }: Call) {
        const parentId = optionalString(body, 'parentDocumentId');
        const parent = parentId == null ? undefined : authorizeDocument(user, parentId, 'read');
        const collectionId = parent?.collectionId ?? optionalString(body, 'collectionId') ?? null;
        const publish = optionalBoolean(body, 'publish') ?? false;
        if (publish && collectionId == null) {
            throw new FakeApiError(400, 'validation_error', 'collectionId or parentDocumentId is required to publish');
        }
        if (collectionId != null) {
            requireCollection(collectionId);
            requireAccess(
                strongest([collectionAccess(user, collectionId), parent == null ? null : documentAccess(user, parent)]),
                'write',
            );
        }
        const id = optionalString(body, 'id') ?? crypto.randomUUID();
        if (documents.some(document => document.id === id)) {
            throw new FakeApiError(400, 'validation_error', 'A document with this id already exists');
        }
        const stamp = tick();
        const record: DocumentRecord = {
            id,
            title: requireString(body, 'title'),
            text: normalizeText(optionalString(body, 'text') ?? ''),
            collectionId,
            parentDocumentId: parent?.id ?? null,
            revision: 1,
            createdAt: stamp,
            updatedAt: stamp,
            publishedAt: publish ? stamp : null,
            archivedAt: null,
            deletedAt: null,
            createdById: user.id,
            updatedById: user.id,
        };
        documents.push(record);
        return ok(presentDocument(record));
    }

    /**
     * Revision rule: `revision` rises by one for every accepted update, even one that changes neither title nor
     * text (real Outline does this for non-trivial documents, so a needless push shows up as a revision bump).
     * A stale `lastRevision` answers 409 before anything is written.
     */
    function documentsUpdate({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const lastRevision = optionalInteger(body, 'lastRevision');
        if (lastRevision != null && lastRevision !== document.revision) {
            throw new FakeApiError(409, 'conflict', 'The document was edited since lastRevision');
        }
        const title = optionalString(body, 'title') ?? document.title;
        const textInput = optionalString(body, 'text');
        const text = textInput == null ? document.text : normalizeText(textInput);
        const publishing = (optionalBoolean(body, 'publish') ?? false) && document.publishedAt == null;
        if (publishing) {
            const collectionId = optionalString(body, 'collectionId') ?? document.collectionId;
            if (collectionId == null) {
                throw new FakeApiError(400, 'validation_error', 'collectionId is required to publish');
            }
            requireCollection(collectionId);
            requireAccess(collectionAccess(user, collectionId), 'write');
            document.collectionId = collectionId;
        }
        const stamp = tick();
        document.title = title;
        document.text = text;
        document.revision += 1;
        document.updatedAt = stamp;
        document.updatedById = user.id;
        if (publishing) {
            document.publishedAt = stamp;
        }
        return ok(presentDocument(document));
    }

    function documentsMove({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const parentId = optionalString(body, 'parentDocumentId');
        const parent = parentId == null ? undefined : authorizeDocument(user, parentId, 'write');
        const collectionId = parent?.collectionId ?? optionalString(body, 'collectionId') ?? null;
        if (collectionId == null) {
            throw new FakeApiError(400, 'validation_error', 'collectionId or parentDocumentId is required');
        }
        requireCollection(collectionId);
        requireAccess(
            strongest([collectionAccess(user, collectionId), parent == null ? null : documentAccess(user, parent)]),
            'write',
        );
        const subtree = [document, ...descendantsOf(document)];
        if (parent != null && subtree.includes(parent)) {
            throw new FakeApiError(400, 'validation_error', 'A document cannot be moved into itself');
        }
        const stamp = tick();
        const collectionChanged = collectionId !== document.collectionId;
        document.parentDocumentId = parent?.id ?? null;
        document.updatedAt = stamp;
        for (const member of subtree) {
            if (collectionChanged) {
                member.collectionId = collectionId;
                member.updatedAt = stamp;
            }
        }
        return ok({ documents: subtree.map(presentDocument) });
    }

    /** Archiving takes the whole subtree with it. */
    function documentsArchive({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        if (document.publishedAt == null) {
            throw new FakeApiError(400, 'validation_error', 'Only a published document can be archived');
        }
        const stamp = tick();
        for (const member of [document, ...descendantsOf(document)]) {
            member.archivedAt ??= stamp;
            member.updatedAt = stamp;
        }
        return ok(presentDocument(document));
    }

    /** Deleting moves the subtree to the trash: it disappears from every endpoint but `documents.info`. */
    function documentsDelete({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const stamp = tick();
        for (const member of [document, ...descendantsOf(document)]) {
            member.deletedAt = stamp;
        }
        return ok({ success: true });
    }

    /** Like Outline, listing who a document is shared with needs the right to edit it, not just to read it. */
    function documentsMemberships({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const memberships = documentMemberships.filter(membership => membership.documentId === document.id);
        const { items, pagination } = paginate(body, memberships);
        return ok(userMembershipsResult(items), pagination);
    }

    function documentsGroupMemberships({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const memberships = documentGroupMemberships.filter(membership => membership.documentId === document.id);
        const { items, pagination } = paginate(body, memberships);
        const shared = groups.filter(group => items.some(membership => membership.groupId === group.id));
        return ok({ groups: shared.map(presentGroup), groupMemberships: items }, pagination);
    }

    function documentsAddUser({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const target = requireUser(requireString(body, 'userId'));
        if (target.id === user.id) {
            throw new FakeApiError(400, 'validation_error', 'You cannot invite yourself');
        }
        const membership = upsertUserMembership(document.id, target.id, requirePermission(body));
        return ok(userMembershipsResult([membership]));
    }

    function documentsRemoveUser({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const userId = requireString(body, 'userId');
        arrayRemoveWhere(
            documentMemberships,
            membership => membership.documentId === document.id && membership.userId === userId,
        );
        return ok({ success: true });
    }

    function documentsAddGroup({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const group = requireGroup(requireString(body, 'groupId'));
        const membership = upsertGroupMembership(document.id, group.id, requirePermission(body));
        return ok({ groups: [presentGroup(group)], groupMemberships: [membership] });
    }

    function documentsRemoveGroup({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'id'), 'write');
        const groupId = requireString(body, 'groupId');
        arrayRemoveWhere(
            documentGroupMemberships,
            membership => membership.documentId === document.id && membership.groupId === groupId,
        );
        return ok({ success: true });
    }

    /** Only the user's own direct shares (the roots); group shares are not listed here. */
    function userMembershipsList({ user, body }: Call) {
        const own = documentMemberships
            .filter(membership => membership.userId === user.id)
            .filter(membership =>
                documents.some(document => document.id === membership.documentId && document.deletedAt == null),
            );
        const { items, pagination } = paginate(body, own);
        const shared = items.map(membership => requireDocumentRecord(membership.documentId));
        return ok({ memberships: items, documents: shared.map(presentDocument) }, pagination);
    }

    /** Like Outline: the roots shared with the user's groups (not their subtrees), skipping archived and deleted ones. */
    function groupMembershipsList({ user, body }: Call) {
        const own = documentGroupMemberships
            .filter(membership => userIsInGroup(user, membership.groupId))
            .filter(membership =>
                documents.some(
                    document =>
                        document.id === membership.documentId &&
                        document.deletedAt == null &&
                        document.archivedAt == null,
                ),
            );
        const { items, pagination } = paginate(body, own);
        const sharedGroups = groups.filter(group => items.some(membership => membership.groupId === group.id));
        return ok(
            {
                groups: sharedGroups.map(presentGroup),
                groupMemberships: items,
                documents: items.map(membership => presentDocument(requireDocumentRecord(membership.documentId))),
            },
            pagination,
        );
    }

    function attachmentsCreate({ user, body }: Call) {
        const document = authorizeDocument(user, requireString(body, 'documentId'), 'write');
        const record: AttachmentRecord = {
            id: crypto.randomUUID(),
            name: requireString(body, 'name'),
            contentType: requireString(body, 'contentType'),
            size: requireInteger(body, 'size'),
            documentId: document.id,
        };
        attachments.push(record);
        return ok({
            uploadUrl: `${url}/api/files.create`,
            form: { key: `uploads/${record.id}/${record.name}`, 'Content-Type': record.contentType },
            attachment: presentAttachment(record),
        });
    }

    function attachmentsRedirect({ user, body }: Call) {
        const id = requireString(body, 'id');
        const record = attachments.find(candidate => candidate.id === id);
        if (record == null) {
            throw new FakeApiError(404, 'not_found', 'Attachment not found');
        }
        authorizeDocument(user, record.documentId, 'read');
        return new Response(null, { status: 302, headers: { Location: `${url}/files/${record.id}/${record.name}` } });
    }

    // --- state helpers ---

    function tick() {
        clock += 1000;
        return new Date(clock).toISOString();
    }

    function userIsInGroup(user: FakeUser, groupId: string) {
        return groups.some(group => group.id === groupId && group.memberIds.includes(user.id));
    }

    function ancestorsOf(document: DocumentRecord): DocumentRecord[] {
        const parent = documents.find(candidate => candidate.id === document.parentDocumentId);
        return parent == null ? [] : [parent, ...ancestorsOf(parent)];
    }

    function descendantsOf(document: DocumentRecord): DocumentRecord[] {
        return documents
            .filter(candidate => candidate.parentDocumentId === document.id)
            .flatMap(child => [child, ...descendantsOf(child)]);
    }

    function upsertUserMembership(documentId: string, userId: string, permission: OutlinePermission) {
        const existing = documentMemberships.find(
            membership => membership.documentId === documentId && membership.userId === userId,
        );
        if (existing != null) {
            existing.permission = permission;
            return existing;
        }
        const membership: OutlineDocumentMembership = { id: crypto.randomUUID(), documentId, userId, permission };
        documentMemberships.push(membership);
        return membership;
    }

    function upsertGroupMembership(documentId: string, groupId: string, permission: OutlinePermission) {
        const existing = documentGroupMemberships.find(
            membership => membership.documentId === documentId && membership.groupId === groupId,
        );
        if (existing != null) {
            existing.permission = permission;
            return existing;
        }
        const membership: OutlineDocumentGroupMembership = {
            id: crypto.randomUUID(),
            documentId,
            groupId,
            permission,
        };
        documentGroupMemberships.push(membership);
        return membership;
    }

    function requireDocumentRecord(id: string) {
        const record = documents.find(candidate => candidate.id === id);
        if (record == null) {
            throw new Error(`fakeOutline: unknown document ${id}`);
        }
        return record;
    }

    function requireCollection(id: string) {
        const record = collections.find(collection => collection.id === id);
        if (record == null) {
            throw new FakeApiError(404, 'not_found', 'Collection not found');
        }
        return record;
    }

    function requireUser(id: string) {
        const user = users.find(candidate => candidate.id === id);
        if (user == null) {
            throw new FakeApiError(404, 'not_found', 'User not found');
        }
        return user;
    }

    function requireGroup(id: string) {
        const group = groups.find(candidate => candidate.id === id);
        if (group == null) {
            throw new FakeApiError(404, 'not_found', 'Group not found');
        }
        return group;
    }

    function userMembershipsResult(memberships: OutlineDocumentMembership[]) {
        return {
            users: memberships.map(membership => presentUser(requireUser(membership.userId))),
            memberships,
        };
    }

    // --- presenters ---

    function presentDocument(record: DocumentRecord): OutlineDocument {
        const creator = requireUser(record.createdById);
        const updater = requireUser(record.updatedById);
        return {
            id: record.id,
            title: record.title,
            text: record.text,
            collectionId: record.collectionId,
            parentDocumentId: record.parentDocumentId,
            revision: record.revision,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            publishedAt: record.publishedAt,
            archivedAt: record.archivedAt,
            deletedAt: record.deletedAt,
            createdBy: { id: creator.id, name: creator.name },
            updatedBy: { id: updater.id, name: updater.name },
        };
    }

    function presentGroup(record: GroupRecord): OutlineGroup {
        return { id: record.id, name: record.name, memberCount: record.memberIds.length };
    }
}

class FakeApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

// --- pure helpers ---

function presentUser(user: FakeUser): OutlineUser {
    return { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin };
}

function presentCollection(record: CollectionRecord): OutlineCollection {
    return { id: record.id, name: record.name, permission: record.permission };
}

function presentAttachment(record: AttachmentRecord) {
    return {
        id: record.id,
        name: record.name,
        contentType: record.contentType,
        size: record.size,
        url: `/api/attachments.redirect?id=${record.id}`,
    };
}

function strongest(permissions: (OutlinePermission | null)[]) {
    let best: OutlinePermission | null = null;
    for (const permission of permissions) {
        if (permission != null && (best == null || PERMISSIONS.indexOf(permission) > PERMISSIONS.indexOf(best))) {
            best = permission;
        }
    }
    return best;
}

function requireAccess(access: OutlinePermission | null, need: AccessNeed) {
    if (access == null || (need === 'write' && access === 'read')) {
        throw new FakeApiError(403, 'authorization_error', 'Authorization error');
    }
}

/** `documents.list` filters: every filter must match; dates compare as instants. */
function matchesFilters(document: DocumentRecord, filters: OutlineFilter[]) {
    return filters.every(filter => matchesFilter(document, filter));
}

function matchesFilter(document: DocumentRecord, filter: OutlineFilter) {
    const actual = filterFieldValue(document, filter.field);
    const { value } = filter;
    if (filter.operator === 'isNull') {
        return actual == null;
    }
    if (filter.operator === 'in') {
        return actual != null && Array.isArray(value) && value.includes(actual);
    }
    if (typeof value !== 'string') {
        // eq/neq against null means "is null"/"is not null"; ordering against nothing matches nothing.
        return filter.operator === 'eq' ? actual == null : filter.operator === 'neq' ? actual != null : false;
    }
    if (actual == null) {
        return filter.operator === 'neq';
    }
    const order = comparable(filter.field, actual).localeCompare(comparable(filter.field, value));
    switch (filter.operator) {
        case 'eq':
            return order === 0;
        case 'neq':
            return order !== 0;
        case 'lt':
            return order < 0;
        case 'lte':
            return order <= 0;
        case 'gt':
            return order > 0;
        case 'gte':
            return order >= 0;
        default:
            return assertNever(filter.operator);
    }
}

function filterFieldValue(document: DocumentRecord, field: OutlineFilterField) {
    switch (field) {
        case 'createdAt':
            return document.createdAt;
        case 'updatedAt':
            return document.updatedAt;
        case 'publishedAt':
            return document.publishedAt;
        case 'archivedAt':
            return document.archivedAt;
        case 'collectionId':
            return document.collectionId;
        case 'parentDocumentId':
            return document.parentDocumentId;
        default:
            return assertNever(field);
    }
}

function comparable(field: OutlineFilterField, value: string) {
    return DATE_FIELDS.includes(field) ? new Date(value).toISOString() : value;
}

function ok(data: unknown, pagination?: OutlinePagination) {
    return Response.json({ ok: true, status: 200, data, pagination });
}

function okPage(body: Body, items: unknown[]) {
    const page = paginate(body, items);
    return ok(page.items, page.pagination);
}

function failure(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    return Response.json({ ok: false, error: code, message }, { status, headers });
}

function paginate<T>(body: Body, items: T[]) {
    const limit = optionalInteger(body, 'limit') ?? DEFAULT_PAGE_SIZE;
    const offset = optionalInteger(body, 'offset') ?? 0;
    if (limit < 1 || limit > MAX_PAGE_SIZE || offset < 0) {
        throw new FakeApiError(400, 'validation_error', `limit must be 1-${MAX_PAGE_SIZE} and offset at least 0`);
    }
    return { items: items.slice(offset, offset + limit), pagination: { limit, offset } };
}

// --- request body readers: a malformed body answers 400 like Outline's validation ---

function parseBody(text: string): Body {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new FakeApiError(400, 'validation_error', 'Body is not JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new FakeApiError(400, 'validation_error', 'Body must be an object');
    }
    return Object.fromEntries(Object.entries(parsed));
}

function invalid(key: string, expected: string): never {
    throw new FakeApiError(400, 'validation_error', `${key}: expected ${expected}`);
}

function requireString(body: Body, key: string) {
    return optionalString(body, key) ?? invalid(key, 'a string');
}

function optionalString(body: Body, key: string) {
    const value = body[key];
    if (value == null) {
        return undefined;
    }
    return typeof value === 'string' ? value : invalid(key, 'a string');
}

function optionalBoolean(body: Body, key: string) {
    const value = body[key];
    if (value == null) {
        return undefined;
    }
    return typeof value === 'boolean' ? value : invalid(key, 'a boolean');
}

function optionalInteger(body: Body, key: string) {
    const value = body[key];
    if (value == null) {
        return undefined;
    }
    return typeof value === 'number' && Number.isInteger(value) ? value : invalid(key, 'an integer');
}

function requireInteger(body: Body, key: string) {
    return optionalInteger(body, key) ?? invalid(key, 'an integer');
}

function optionalStringArray(body: Body, key: string) {
    const value = body[key];
    if (value == null) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        return invalid(key, 'an array of strings');
    }
    return value.map(item => (typeof item === 'string' ? item : invalid(key, 'an array of strings')));
}

function requirePermission(body: Body) {
    const raw = requireString(body, 'permission');
    return PERMISSIONS.find(permission => permission === raw) ?? invalid('permission', PERMISSIONS.join(' | '));
}

function readFilters(body: Body): OutlineFilter[] {
    const raw = body.filters;
    if (raw == null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        return invalid('filters', 'an array');
    }
    return raw.map(readFilter);
}

function readFilter(raw: unknown): OutlineFilter {
    if (typeof raw !== 'object' || raw === null) {
        return invalid('filters', 'objects');
    }
    const entry = Object.fromEntries(Object.entries(raw));
    const field = FILTER_FIELDS.find(candidate => candidate === entry.field);
    const operator = FILTER_OPERATORS.find(candidate => candidate === entry.operator);
    if (field == null || operator == null) {
        return invalid('filters', `field ${FILTER_FIELDS.join('|')} and operator ${FILTER_OPERATORS.join('|')}`);
    }
    const value = readFilterValue(entry.value);
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    if (DATE_FIELDS.includes(field) && operator !== 'isNull' && values.some(item => Number.isNaN(Date.parse(item)))) {
        return invalid('filters', 'a date value for a date field');
    }
    return { field, operator, value };
}

function readFilterValue(value: unknown): string | string[] | null | undefined {
    if (value == null || typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => (typeof item === 'string' ? item : invalid('filters', 'string values')));
    }
    return invalid('filters', 'a string, array or null value');
}
