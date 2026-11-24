import { waitFor } from '@nzyme/utils/waitFor.js';

import { OutlineApiError, OutlineConflictError, OutlineNetworkError, OutlineRateLimitError } from './errors.js';
import type {
    AttachmentsCreateParams,
    CollectionsAddGroupParams,
    CollectionsAddUserParams,
    CollectionsCreateParams,
    CollectionsRemoveGroupParams,
    CollectionsRemoveUserParams,
    CollectionsUpdateParams,
    CollectionGroupMembershipsResult,
    CollectionMembershipsResult,
    DocumentGroupMembershipsResult,
    DocumentMembershipsResult,
    DocumentsAddGroupParams,
    DocumentsAddGroupResult,
    DocumentsAddUserParams,
    DocumentsCreateParams,
    DocumentsDraftsParams,
    DocumentsListParams,
    DocumentsMoveParams,
    DocumentsMoveResult,
    DocumentsSearchParams,
    DocumentsRemoveGroupParams,
    DocumentsRemoveUserParams,
    DocumentsUpdateParams,
    GroupMembershipsResult,
    OutlineAttachmentUpload,
    OutlineAuthInfo,
    OutlineCollection,
    OutlineDocument,
    OutlineGroup,
    OutlineNavigationNode,
    OutlinePage,
    OutlinePageParams,
    OutlinePagination,
    OutlineSearchResult,
    OutlineUser,
    UserMembershipsResult,
    UsersListParams,
} from './OutlineTypes.js';

/** The part of `fetch` the client uses, so `fakeOutline` and test stubs fit without matching Bun's `fetch` type. */
export type OutlineFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface OutlineClientOptions {
    /** Base URL of the workspace, e.g. `https://app.getoutline.com`. */
    url: string;
    /** Called before every request, so a refreshed token is picked up. */
    getAccessToken: () => Promise<string>;
    fetch?: OutlineFetch;
    /** Waits out a 429's `Retry-After`; tests replace it. */
    sleep?: (ms: number) => Promise<void>;
    /**
     * Epoch milliseconds no 429 wait may pass: a `Retry-After` reaching beyond it throws `OutlineRateLimitError`
     * at once, so a caller killed at a fixed timeout ends its run in time. Without it a 429 is always waited out.
     */
    deadline?: number;
    /** The clock the deadline is checked against. */
    now?: () => number;
}

interface Envelope<T> {
    data: T;
    pagination?: OutlinePagination;
}

const MAX_RATE_LIMIT_RETRIES = 10;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

/**
 * Typed client over the Outline endpoints the sync needs. A 429 waits `Retry-After` (never past the deadline) and retries, a 409
 * throws `OutlineConflictError`, other failures `OutlineApiError`.
 */
export class OutlineClient {
    private readonly baseUrl: string;
    private readonly getAccessToken: () => Promise<string>;
    private readonly fetchImpl: OutlineFetch;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly deadline: number | undefined;
    private readonly now: () => number;

    constructor(options: OutlineClientOptions) {
        this.baseUrl = options.url.replace(/\/+$/, '');
        this.getAccessToken = options.getAccessToken;
        this.fetchImpl = options.fetch ?? fetch;
        this.sleep = options.sleep ?? waitFor;
        this.deadline = options.deadline;
        this.now = options.now ?? Date.now;
    }

    readonly documents = {
        list: (params: DocumentsListParams = {}) => this.callPage<OutlineDocument>('documents.list', params),
        /**
         * Documents the user can see, newest first by default. Without a query it also covers what an unfiltered
         * `documents.list` misses: the user's drafts and documents shared with the user in a collection the user
         * cannot read.
         */
        search: (params: DocumentsSearchParams = {}) => this.callPage<OutlineSearchResult>('documents.search', params),
        info: (params: { id: string }) => this.callData<OutlineDocument>('documents.info', params),
        create: (params: DocumentsCreateParams) => this.callData<OutlineDocument>('documents.create', params),
        update: (params: DocumentsUpdateParams) => this.callData<OutlineDocument>('documents.update', params),
        move: (params: DocumentsMoveParams) => this.callData<DocumentsMoveResult>('documents.move', params),
        archive: (params: { id: string }) => this.callData<OutlineDocument>('documents.archive', params),
        delete: async (params: { id: string }) => {
            await this.call('documents.delete', params);
        },
        drafts: (params: DocumentsDraftsParams = {}) => this.callPage<OutlineDocument>('documents.drafts', params),
        /** Direct user shares of a document, up to 100 (a page, so a longer list is cut off). */
        memberships: (params: { id: string }) =>
            this.callData<DocumentMembershipsResult>('documents.memberships', { ...params, limit: 100 }),
        /** Direct group shares of a document, up to 100. Like `memberships`, it needs the right to edit the document. */
        groupMemberships: (params: { id: string }) =>
            this.callData<DocumentGroupMembershipsResult>('documents.group_memberships', { ...params, limit: 100 }),
        addUser: (params: DocumentsAddUserParams) =>
            this.callData<DocumentMembershipsResult>('documents.add_user', params),
        removeUser: async (params: DocumentsRemoveUserParams) => {
            await this.call('documents.remove_user', params);
        },
        addGroup: (params: DocumentsAddGroupParams) =>
            this.callData<DocumentsAddGroupResult>('documents.add_group', params),
        removeGroup: async (params: DocumentsRemoveGroupParams) => {
            await this.call('documents.remove_group', params);
        },
    };

    readonly collections = {
        list: (params: OutlinePageParams = {}) => this.callPage<OutlineCollection>('collections.list', params),
        info: (params: { id: string }) => this.callData<OutlineCollection>('collections.info', params),
        create: (params: CollectionsCreateParams) => this.callData<OutlineCollection>('collections.create', params),
        update: (params: CollectionsUpdateParams) => this.callData<OutlineCollection>('collections.update', params),
        addUser: (params: CollectionsAddUserParams) =>
            this.callData<CollectionMembershipsResult>('collections.add_user', params),
        removeUser: async (params: CollectionsRemoveUserParams) => {
            await this.call('collections.remove_user', params);
        },
        addGroup: (params: CollectionsAddGroupParams) =>
            this.callData<CollectionGroupMembershipsResult>('collections.add_group', params),
        removeGroup: async (params: CollectionsRemoveGroupParams) => {
            await this.call('collections.remove_group', params);
        },
        documents: (params: { id: string }) => this.callData<OutlineNavigationNode[]>('collections.documents', params),
        /** One page of the users with direct access to a collection; the list is under `data`, so `listAll` takes it. */
        memberships: async (params: { id: string } & OutlinePageParams) => ({
            data: (await this.collections.membershipsPage(params)).memberships,
        }),
        /** One page of the groups with access to a collection. */
        groupMemberships: async (params: { id: string } & OutlinePageParams) => ({
            data: (await this.collections.groupMembershipsPage(params)).groupMemberships,
        }),
        /** One page of a collection's user memberships, with the users they name. */
        membershipsPage: (params: { id: string } & OutlinePageParams) =>
            this.callData<CollectionMembershipsResult>('collections.memberships', params),
        /** One page of a collection's group memberships, with the groups they name. */
        groupMembershipsPage: (params: { id: string } & OutlinePageParams) =>
            this.callData<CollectionGroupMembershipsResult>('collections.group_memberships', params),
    };

    readonly userMemberships = {
        list: (params: OutlinePageParams = {}) => this.callData<UserMembershipsResult>('userMemberships.list', params),
    };

    readonly groupMemberships = {
        list: (params: OutlinePageParams = {}) =>
            this.callData<GroupMembershipsResult>('groupMemberships.list', params),
    };

    readonly users = {
        list: (params: UsersListParams = {}) => this.callPage<OutlineUser>('users.list', params),
    };

    readonly groups = {
        list: (params: OutlinePageParams = {}) => this.callPage<OutlineGroup>('groups.list', params),
    };

    readonly attachments = {
        create: (params: AttachmentsCreateParams) =>
            this.callData<OutlineAttachmentUpload>('attachments.create', params),
        /** Resolves to the URL the attachment can be downloaded from (the redirect target), not the bytes. */
        redirect: async (params: { id: string }) => {
            const response = await this.send('attachments.redirect', params, { redirect: 'manual' });
            const location = response.headers.get('Location');
            if (location == null) {
                throw new OutlineApiError(
                    'attachments.redirect',
                    response.status,
                    'No redirect location in the response',
                );
            }
            return location;
        },
    };

    readonly auth = {
        info: () => this.callData<OutlineAuthInfo>('auth.info', {}),
    };

    private async callData<T>(method: string, body: object) {
        const envelope = await this.call<T>(method, body);
        return envelope.data;
    }

    private async callPage<T>(method: string, body: OutlinePageParams): Promise<OutlinePage<T>> {
        const envelope = await this.call<T[]>(method, body);
        return {
            data: envelope.data,
            pagination: envelope.pagination ?? { limit: body.limit ?? envelope.data.length, offset: body.offset ?? 0 },
        };
    }

    private async call<T>(method: string, body: object): Promise<Envelope<T>> {
        const response = await this.send(method, body, {});
        const envelope: unknown = await response.json();
        if (!isEnvelope<T>(envelope)) {
            throw new OutlineApiError(method, response.status, 'The response is not an Outline envelope');
        }
        return envelope;
    }

    /** Sends one call, waiting out 429s, and returns the successful response; never returns a failed one. */
    private async send(method: string, body: object, init: RequestInit): Promise<Response> {
        for (let attempt = 0; ; attempt++) {
            const token = await this.getAccessToken();
            const response = await this.post(method, body, token, init);
            if (response.status < 400) {
                return response;
            }
            const failure = await readFailure(response, token);
            if (response.status === 429) {
                const waitMs = readRetryAfterMs(response);
                if (
                    attempt >= MAX_RATE_LIMIT_RETRIES ||
                    (this.deadline != null && this.now() + waitMs > this.deadline)
                ) {
                    throw new OutlineRateLimitError(method, failure.message, failure.code);
                }
                await this.sleep(waitMs);
                continue;
            }
            if (response.status === 409) {
                throw new OutlineConflictError(method, failure.message, failure.code);
            }
            throw new OutlineApiError(method, response.status, failure.message, failure.code);
        }
    }

    private async post(method: string, body: object, token: string, init: RequestInit) {
        try {
            return await this.fetchImpl(`${this.baseUrl}/api/${method}`, {
                ...init,
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            throw new OutlineNetworkError(method, scrub(message, token));
        }
    }
}

/** The response shape is Outline's contract; only the envelope itself is checked at runtime. */
function isEnvelope<T>(value: unknown): value is Envelope<T> {
    return typeof value === 'object' && value !== null && 'data' in value;
}

async function readFailure(response: Response, token: string) {
    const text = await response.text().catch(() => '');
    let message = text.slice(0, 500) || response.statusText;
    let code: string | undefined;
    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
            if ('message' in parsed && typeof parsed.message === 'string') {
                message = parsed.message;
            }
            if ('error' in parsed && typeof parsed.error === 'string') {
                code = parsed.error;
            }
        }
    } catch {
        // Not JSON: the raw text stays as the message.
    }
    return { message: scrub(message, token), code };
}

function readRetryAfterMs(response: Response) {
    const header = response.headers.get('Retry-After');
    const seconds = header == null ? Number.NaN : Number(header);
    return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS) * 1000;
}

/** Outline never needs to see the token echoed; hide it should a server or a runtime error repeat it. */
function scrub(message: string, token: string) {
    return token === '' ? message : message.replaceAll(token, '[redacted]');
}
