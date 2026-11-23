/** Wire shapes of the Outline API: the fields the sync reads and writes, not the full payloads. */

export type OutlinePermission = 'read' | 'read_write' | 'admin';

/** Workspace-wide access to a collection; `null` makes it private (members only). */
export type OutlineCollectionPermission = 'read' | 'read_write' | null;

export interface OutlineUserRef {
    id: string;
    name: string;
}

export interface OutlineUser extends OutlineUserRef {
    email: string;
    isAdmin: boolean;
}

export interface OutlineGroup {
    id: string;
    name: string;
    memberCount: number;
}

export interface OutlineCollection {
    id: string;
    name: string;
    permission: OutlineCollectionPermission;
}

/** A user's membership of a collection, as `collections.memberships` returns it. */
export interface OutlineCollectionMembership {
    id: string;
    collectionId: string;
    userId: string;
    permission: OutlinePermission;
}

/** A group's membership of a collection, as `collections.group_memberships` returns it. */
export interface OutlineCollectionGroupMembership {
    id: string;
    collectionId: string;
    groupId: string;
    permission: OutlinePermission;
}

export interface OutlineDocument {
    id: string;
    title: string;
    /** Markdown without the title. */
    text: string;
    collectionId: string | null;
    parentDocumentId: string | null;
    /** Counts saved revisions; the value `lastRevision` is compared with. */
    revision: number;
    createdAt: string;
    updatedAt: string;
    /** `null` for a draft. */
    publishedAt: string | null;
    archivedAt: string | null;
    /** Set while the document is in the trash; `documents.info` still answers for it to anyone who may restore it. */
    deletedAt: string | null;
    createdBy: OutlineUserRef;
    /** Who saved the current revision. */
    updatedBy: OutlineUserRef;
}

export interface OutlineNavigationNode {
    id: string;
    title: string;
    url: string;
    children: OutlineNavigationNode[];
}

/** A user's direct access to a document. */
export interface OutlineDocumentMembership {
    id: string;
    documentId: string;
    userId: string;
    permission: OutlinePermission;
    /** Set when the access is inherited from a share on a parent document; absent or `null` for a direct share. */
    sourceId?: string | null;
}

export interface OutlineDocumentGroupMembership {
    id: string;
    documentId: string;
    groupId: string;
    permission: OutlinePermission;
    /** Set when the access is inherited from a share on a parent document; absent or `null` for a direct share. */
    sourceId?: string | null;
}

export interface OutlineAttachment {
    id: string;
    name: string;
    contentType: string;
    size: number;
    /** `/api/attachments.redirect?id=<id>`, the link used in document text. */
    url: string;
}

export interface OutlineAttachmentUpload {
    uploadUrl: string;
    form: Record<string, string>;
    attachment: OutlineAttachment;
}

export interface OutlineAuthInfo {
    user: OutlineUser;
    team: { id: string; name: string };
}

export interface OutlinePagination {
    limit: number;
    offset: number;
}

export interface OutlinePage<T> {
    data: T[];
    pagination: OutlinePagination;
}

export interface OutlinePageParams {
    /** At most 100. */
    limit?: number;
    offset?: number;
}

export type OutlineFilterOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'isNull';

export type OutlineFilterField =
    | 'createdAt'
    | 'updatedAt'
    | 'publishedAt'
    | 'archivedAt'
    | 'collectionId'
    | 'parentDocumentId';

export interface OutlineFilter {
    field: OutlineFilterField;
    operator: OutlineFilterOperator;
    value?: string | string[] | null;
}

export interface DocumentsListParams extends OutlinePageParams {
    /** Drafts are returned only when a filter mentions `publishedAt`, archived documents only for `archivedAt`. */
    filters?: OutlineFilter[];
}

export interface DocumentsSearchParams extends OutlinePageParams {
    /** Without one, every document the user can see matches, archived ones included. */
    query?: string;
    sort?: 'updatedAt' | 'createdAt';
    direction?: 'ASC' | 'DESC';
    /** The `documents.list` filter fields; unlike there, drafts are never hidden and archived ones only by an `archivedAt isNull` filter. */
    filters?: OutlineFilter[];
}

/** One `documents.search` hit; `context` and `ranking` matter only with a query. */
export interface OutlineSearchResult {
    document: OutlineDocument;
    context?: string;
    ranking?: number;
}

export interface DocumentsDraftsParams extends OutlinePageParams {
    collectionId?: string;
}

export interface DocumentsCreateParams {
    /** A UUID chosen by the caller, so a create whose reply was lost can be looked up (and not sent twice). */
    id?: string;
    title: string;
    text?: string;
    collectionId?: string;
    parentDocumentId?: string;
    /** Without it the document is a draft. */
    publish?: boolean;
}

export interface DocumentsUpdateParams {
    id: string;
    title?: string;
    text?: string;
    /** Publishes a draft; needs a `collectionId` on the document or in this call. */
    publish?: boolean;
    collectionId?: string;
    /** The revision this edit is based on; a different current revision answers 409. */
    lastRevision?: number;
}

export interface DocumentsMoveParams {
    id: string;
    collectionId?: string;
    parentDocumentId?: string | null;
    /** Position among the new siblings. */
    index?: number;
}

export interface DocumentMembershipsResult {
    users: OutlineUser[];
    memberships: OutlineDocumentMembership[];
}

export interface DocumentsAddUserParams {
    id: string;
    userId: string;
    permission: OutlinePermission;
}

export interface DocumentsRemoveUserParams {
    id: string;
    userId: string;
}

export interface DocumentsAddGroupParams {
    id: string;
    groupId: string;
    permission: OutlinePermission;
}

export interface DocumentsRemoveGroupParams {
    id: string;
    groupId: string;
}

export interface DocumentsAddGroupResult {
    groups: OutlineGroup[];
    groupMemberships: OutlineDocumentGroupMembership[];
}

/** The groups a document is shared with, as `documents.group_memberships` returns them. */
export type DocumentGroupMembershipsResult = DocumentsAddGroupResult;

export interface CollectionMembershipsResult {
    users: OutlineUser[];
    memberships: OutlineCollectionMembership[];
}

export interface CollectionGroupMembershipsResult {
    groups: OutlineGroup[];
    groupMemberships: OutlineCollectionGroupMembership[];
}

export interface UserMembershipsResult {
    memberships: OutlineDocumentMembership[];
    documents: OutlineDocument[];
}

/** Documents shared with the user's groups: only the shared roots, with the groups and memberships behind them. */
export interface GroupMembershipsResult {
    groups: OutlineGroup[];
    groupMemberships: OutlineDocumentGroupMembership[];
    documents: OutlineDocument[];
}

export interface UsersListParams extends OutlinePageParams {
    /** Matches name or email. */
    query?: string;
    emails?: string[];
    ids?: string[];
}

export interface AttachmentsCreateParams {
    name: string;
    size: number;
    contentType: string;
    documentId: string;
}

export interface CollectionsCreateParams {
    name: string;
    /** Workspace-wide access; `null` makes the collection private (members only). */
    permission?: OutlineCollectionPermission;
}

export interface DocumentsMoveResult {
    documents: OutlineDocument[];
}
