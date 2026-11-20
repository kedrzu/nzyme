/**
 * A recording fake of the Gmail API, behind google-auth's fake Google (its token endpoint and access
 * token check), for running the Gmail commands in-process.
 */
import type { gmail_v1 } from '@googleapis/gmail';

import { startFakeGoogle } from '@nzyme/google-auth/__fixtures__/googleTestCli.js';

import { gmailService } from '../gmailService.js';

/** An attachment of a {@link FakeGmailMessage}. */
export interface FakeGmailAttachment {
    partId: string;
    filename: string;
    mimeType: string;
    content: string;
    /** The Content-ID of an image embedded in the HTML body, without angle brackets. */
    cid?: string;
}

/** A message the fake holds. */
export interface FakeGmailMessage {
    id: string;
    threadId: string;
    from: string;
    to?: string;
    cc?: string;
    subject: string;
    date: string;
    /** Any other header: `Message-ID`, `References`, `In-Reply-To`, `Reply-To`, `Bcc`. */
    headers?: Record<string, string>;
    html?: string;
    text?: string;
    labelIds?: string[];
    attachments?: FakeGmailAttachment[];
}

/** A draft the fake holds; its message is one of the fake's messages. */
export interface FakeGmailDraft {
    id: string;
    messageId: string;
}

/** Options of {@link startFakeGmail}. */
export interface FakeGmailOptions {
    /** The account's address, in its profile. */
    email: string;
    /** `messagesTotal` is what `labels.get` reports. */
    labels?: gmail_v1.Schema$Label[];
    /** Oldest first: a thread lists them in this order, a search in the reverse (newest first). */
    messages?: FakeGmailMessage[];
    drafts?: FakeGmailDraft[];
    /** The send-as addresses, with their signatures. */
    sendAs?: gmail_v1.Schema$SendAs[];
}

/**
 * A request the fake received, its path relative to `/gmail/v1/users/me`. A media upload keeps its
 * `/upload` prefix: `/upload/gmail/v1/users/me/drafts` is recorded as `/upload/drafts`.
 */
export interface FakeGmailRequest {
    method: string;
    path: string;
    query: URLSearchParams;
    /** The JSON body of a write. */
    body?: unknown;
}

/** The parts of a draft media upload: the JSON metadata and the RFC 822 message. */
export interface FakeGmailUpload {
    metadata: gmail_v1.Schema$Draft;
    message: string;
}

const USER_PREFIX = '/gmail/v1/users/me';
const UPLOAD_PREFIX = `/upload${USER_PREFIX}`;

/**
 * Starts the fake. `requests` records every Gmail API call, `uploads` every draft upload, `grants`
 * every token request, and `violations` every call no Gmail command may make: sending, deleting a
 * message, thread or draft, trashing anything but a draft's message, or deleting a label that still
 * has messages.
 */
export function startFakeGmail(options: FakeGmailOptions) {
    const requests: FakeGmailRequest[] = [];
    const uploads: FakeGmailUpload[] = [];
    const violations: string[] = [];
    const messages = options.messages ?? [];
    const drafts = [...(options.drafts ?? [])];
    const labels = [...(options.labels ?? [])];
    let created = 0;
    const google = startFakeGoogle({ email: options.email, scopes: gmailService.scopes, api: answer });

    return { endpoints: google.endpoints, grants: google.grants, requests, uploads, violations, stop: google.stop };

    async function answer(request: Request) {
        const url = new URL(request.url);
        const upload = url.pathname.startsWith(UPLOAD_PREFIX);
        if (!upload && !url.pathname.startsWith(USER_PREFIX)) {
            return notFound();
        }

        const path = upload ? `/upload${url.pathname.slice(UPLOAD_PREFIX.length)}` : url.pathname.slice(USER_PREFIX.length);
        const uploaded = upload ? await readUpload(request) : undefined;
        const body = upload ? undefined : await readJson(request);
        requests.push({ method: request.method, path, query: url.searchParams, body });
        if (uploaded) {
            uploads.push(uploaded);
        }

        const violation = forbiddenCall(request.method, path);
        if (violation) {
            violations.push(violation);
            return Response.json({ error: { code: 403, message: violation } }, { status: 403 });
        }

        const segments = path.split('/').filter(Boolean);
        if (uploaded) {
            return answerUpload(request.method, segments, uploaded);
        }

        switch (`${request.method} ${segments[0]}`) {
            case 'GET profile':
                return Response.json({ emailAddress: options.email });
            case 'GET labels':
            case 'POST labels':
            case 'DELETE labels':
                return answerLabels(request.method, segments[1], body);
            case 'GET threads':
                return answerThread(segments[1]);
            case 'POST threads':
                return segments[2] === 'modify' && threadMessages(segments[1]).length > 0
                    ? Response.json({ id: segments[1] })
                    : notFound();
            case 'GET messages':
                return answerMessages(segments);
            case 'POST messages':
                return segments[2] === 'trash' && findMessage(segments[1])
                    ? Response.json({ id: segments[1], labelIds: ['TRASH'] })
                    : notFound();
            case 'GET drafts':
                return answerDrafts(segments[1]);
            case 'GET settings':
                return Response.json({ sendAs: options.sendAs ?? [] });
            default:
                return notFound();
        }
    }

    function forbiddenCall(method: string, path: string) {
        const trashed = /^\/messages\/([^/]+)\/trash$/.exec(path)?.[1];
        if (trashed !== undefined && !findMessage(trashed)?.labelIds?.includes('DRAFT')) {
            return `trash of non-draft message ${trashed}`;
        }

        const label = method === 'DELETE' ? /^\/labels\/([^/]+)$/.exec(path)?.[1] : undefined;
        if (label !== undefined && labels.find(entry => entry.id === label)?.messagesTotal !== 0) {
            return `delete of label ${label}, which has messages`;
        }

        const forbidden =
            /\/send$/.test(path) ||
            /\/batchDelete$/.test(path) ||
            /^\/threads\/[^/]+\/trash$/.test(path) ||
            (method === 'DELETE' && /^\/(messages|threads|drafts)\//.test(path));
        return forbidden ? `${method} ${path}` : undefined;
    }

    function answerUpload(method: string, [, , id]: string[], upload: FakeGmailUpload) {
        if (method === 'PUT' && !drafts.some(draft => draft.id === id)) {
            return notFound();
        }

        created++;
        return Response.json({
            id: id ?? `r-draft-${created}`,
            message: { id: `r-message-${created}`, threadId: upload.metadata.message?.threadId ?? `r-thread-${created}` },
        });
    }

    function answerLabels(method: string, id: string | undefined, body: unknown) {
        if (method === 'POST') {
            const name = typeof body === 'object' && body && 'name' in body ? String(body.name) : '';
            const label = { id: `Label_new_${labels.length}`, name, type: 'user', messagesTotal: 0 };
            labels.push(label);
            return Response.json(label);
        }

        if (!id) {
            // Like Gmail, the list carries no message counts; labels.get does.
            return Response.json({ labels: labels.map(({ id, name, type }) => ({ id, name, type })) });
        }

        const index = labels.findIndex(label => label.id === id);
        const label = labels[index];
        if (!label) {
            return notFound();
        }

        if (method === 'DELETE') {
            labels.splice(index, 1);
            return new Response(null, { status: 204 });
        }

        return Response.json(label);
    }

    function answerThread(id: string | undefined) {
        const thread = threadMessages(id);
        return thread.length > 0 ? Response.json({ id, messages: thread.map(toGmailMessage) }) : notFound();
    }

    function answerMessages([, id, attachments, attachmentId]: string[]) {
        if (!id) {
            const listed = messages.toReversed().map(message => ({ id: message.id, threadId: message.threadId }));
            return Response.json({ messages: listed, resultSizeEstimate: listed.length });
        }

        const message = findMessage(id);
        if (!message) {
            return notFound();
        }

        if (attachments !== 'attachments') {
            return Response.json(toGmailMessage(message));
        }

        const attachment = message.attachments?.find(entry => gmailAttachmentId(message, entry) === attachmentId);
        return attachment
            ? Response.json({ size: attachment.content.length, data: base64Url(attachment.content) })
            : notFound();
    }

    function answerDrafts(id: string | undefined) {
        if (!id) {
            const listed = drafts.map(draft => ({ id: draft.id, message: draftMessage(draft) }));
            return Response.json({ drafts: listed, resultSizeEstimate: listed.length });
        }

        const draft = drafts.find(entry => entry.id === id);
        return draft ? Response.json({ id, message: draftMessage(draft) }) : notFound();
    }

    function draftMessage(draft: FakeGmailDraft) {
        const message = findMessage(draft.messageId);
        return message ? toGmailMessage(message) : { id: draft.messageId };
    }

    function findMessage(id: string | undefined) {
        return messages.find(message => message.id === id);
    }

    function threadMessages(id: string | undefined) {
        return messages.filter(message => message.threadId === id);
    }
}

/** The message as the Gmail API returns it in `format: 'full'`. */
function toGmailMessage(message: FakeGmailMessage): gmail_v1.Schema$Message {
    const headers = [
        { name: 'From', value: message.from },
        { name: 'To', value: message.to },
        { name: 'Cc', value: message.cc },
        { name: 'Subject', value: message.subject },
        { name: 'Date', value: message.date },
        ...Object.entries(message.headers ?? {}).map(([name, value]) => ({ name, value })),
    ].filter(header => header.value !== undefined);

    const bodies: gmail_v1.Schema$MessagePart[] = [];
    if (message.text !== undefined) {
        bodies.push({ partId: '0.1', mimeType: 'text/plain', body: { data: base64Url(message.text) } });
    }

    if (message.html !== undefined) {
        bodies.push({ partId: '0.2', mimeType: 'text/html', body: { data: base64Url(message.html) } });
    }

    const attachments = (message.attachments ?? []).map(attachment => ({
        partId: attachment.partId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        headers: attachment.cid ? [{ name: 'Content-ID', value: `<${attachment.cid}>` }] : [],
        body: { attachmentId: gmailAttachmentId(message, attachment), size: attachment.content.length },
    }));

    return {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds ?? [],
        snippet: '',
        payload: {
            mimeType: 'multipart/mixed',
            headers,
            parts: [{ partId: '0', mimeType: 'multipart/alternative', parts: bodies }, ...attachments],
        },
    };
}

/** Gmail hands out a new attachment id on every fetch; the fake's is fixed, but no part id. */
function gmailAttachmentId(message: FakeGmailMessage, attachment: FakeGmailAttachment) {
    return `ANGjdJ-${message.id}-${attachment.partId}`;
}

async function readJson(request: Request): Promise<unknown> {
    const text = await request.text();
    return text ? JSON.parse(text) : undefined;
}

/** A multipart upload: the JSON metadata part, then the media part. */
async function readUpload(request: Request): Promise<FakeGmailUpload | undefined> {
    const boundary = /boundary=([^;]+)/.exec(request.headers.get('content-type') ?? '')?.[1];
    if (!boundary) {
        return undefined;
    }

    const parts = (await request.text())
        .split(`--${boundary}`)
        .slice(1, -1)
        .map(part => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    const [metadata, message] = parts;
    return metadata !== undefined && message !== undefined ? { metadata: JSON.parse(metadata), message } : undefined;
}

function base64Url(text: string) {
    return Buffer.from(text, 'utf8').toString('base64url');
}

function notFound() {
    return Response.json({ error: { code: 404, message: 'Requested entity was not found.' } }, { status: 404 });
}
