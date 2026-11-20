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
    html?: string;
    text?: string;
    labelIds?: string[];
    attachments?: FakeGmailAttachment[];
}

/** Options of {@link startFakeGmail}. */
export interface FakeGmailOptions {
    /** The account's address, in its profile. */
    email: string;
    labels?: gmail_v1.Schema$Label[];
    /** Oldest first: a thread lists them in this order, a search in the reverse (newest first). */
    messages?: FakeGmailMessage[];
}

/** A request the fake received, its path relative to `/gmail/v1/users/me`. */
export interface FakeGmailRequest {
    method: string;
    path: string;
    query: URLSearchParams;
}

const USER_PREFIX = '/gmail/v1/users/me';

/** Starts the fake; `requests` records every Gmail API call, `grants` every token request. */
export function startFakeGmail(options: FakeGmailOptions) {
    const requests: FakeGmailRequest[] = [];
    const messages = options.messages ?? [];
    const google = startFakeGoogle({ email: options.email, scopes: gmailService.scopes, api: answer });

    return { endpoints: google.endpoints, grants: google.grants, requests, stop: google.stop };

    function answer(request: Request) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith(USER_PREFIX)) {
            return notFound();
        }

        const path = url.pathname.slice(USER_PREFIX.length);
        requests.push({ method: request.method, path, query: url.searchParams });

        const segments = path.split('/').filter(Boolean);
        if (request.method !== 'GET') {
            return notFound();
        }

        switch (segments[0]) {
            case 'profile':
                return Response.json({ emailAddress: options.email });
            case 'labels':
                return Response.json({ labels: options.labels ?? [] });
            case 'threads':
                return answerThread(segments[1]);
            case 'messages':
                return answerMessages(segments);
            default:
                return notFound();
        }
    }

    function answerThread(id: string | undefined) {
        const thread = messages.filter(message => message.threadId === id);
        return thread.length > 0 ? Response.json({ id, messages: thread.map(toGmailMessage) }) : notFound();
    }

    function answerMessages([, id, attachments, attachmentId]: string[]) {
        if (!id) {
            const listed = messages.toReversed().map(message => ({ id: message.id, threadId: message.threadId }));
            return Response.json({ messages: listed, resultSizeEstimate: listed.length });
        }

        const message = messages.find(entry => entry.id === id);
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
}

/** The message as the Gmail API returns it in `format: 'full'`. */
function toGmailMessage(message: FakeGmailMessage): gmail_v1.Schema$Message {
    const headers = [
        { name: 'From', value: message.from },
        { name: 'To', value: message.to },
        { name: 'Cc', value: message.cc },
        { name: 'Subject', value: message.subject },
        { name: 'Date', value: message.date },
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
        headers: [],
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

function base64Url(text: string) {
    return Buffer.from(text, 'utf8').toString('base64url');
}

function notFound() {
    return Response.json({ error: { code: 404, message: 'Requested entity was not found.' } }, { status: 404 });
}
