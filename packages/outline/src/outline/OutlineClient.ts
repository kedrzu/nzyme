import { waitFor } from '@nzyme/utils/waitFor.js';

import { OutlineApiError, OutlineConflictError, OutlineNetworkError, OutlineRateLimitError } from './errors.js';
import { createRateLimiter } from './rateLimiter.js';
import type { OutlineRateLimitKind, RateLimiter } from './rateLimiter.js';
import type {
    AttachmentsCreateParams,
    CollectionsCreateParams,
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
    /** Clock and sleep for rate limiting; tests replace them. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

interface Envelope<T> {
    data: T;
    pagination?: OutlinePagination;
}

const MAX_RATE_LIMIT_RETRIES = 10;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const CREATE_METHODS = new Set(['documents.create', 'attachments.create']);

/**
 * Typed client over the Outline endpoints the sync needs. Calls are paced by the rate limiter; a 429 waits
 * `Retry-After` and retries, a 409 throws `OutlineConflictError`, other failures `OutlineApiError`.
 */
export class OutlineClient {
    private readonly baseUrl: string;
    private readonly getAccessToken: () => Promise<string>;
    private readonly fetchImpl: OutlineFetch;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly limiter: RateLimiter;

    constructor(options: OutlineClientOptions) {
        this.baseUrl = options.url.replace(/\/+$/, '');
        this.getAccessToken = options.getAccessToken;
        this.fetchImpl = options.fetch ?? fetch;
        this.sleep = options.sleep ?? waitFor;
        this.limiter = createRateLimiter({ now: options.now, sleep: this.sleep });
    }

    readonly documents = {
        list: (params: DocumentsListParams = {}) => this.callPage<OutlineDocument>('documents.list', params),
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
        documents: (params: { id: string }) => this.callData<OutlineNavigationNode[]>('collections.documents', params),
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
        const kind: OutlineRateLimitKind = CREATE_METHODS.has(method) ? 'create' : 'general';
        for (let attempt = 0; ; attempt++) {
            await this.limiter.acquire(kind);
            const token = await this.getAccessToken();
            const response = await this.post(method, body, token, init);
            if (response.status < 400) {
                return response;
            }
            const failure = await readFailure(response, token);
            if (response.status === 429) {
                if (attempt >= MAX_RATE_LIMIT_RETRIES) {
                    throw new OutlineRateLimitError(method, failure.message, failure.code);
                }
                await this.sleep(readRetryAfterMs(response));
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
