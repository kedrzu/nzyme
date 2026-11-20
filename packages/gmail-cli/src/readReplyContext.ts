import type { QuotedMessage } from './compose.js';
import { buildReferences, replySubject } from './compose.js';
import type { GmailClient } from './createGmailClient.js';
import { extractRawBody } from './gmailContent.js';
import { getHeader } from './utils/getHeader.js';

/** What a reply in a thread defaults to, from the thread's last real (non-draft) message. */
export interface ReplyContext {
    to: string;
    subject: string;
    inReplyTo: string;
    references: string;
    quote: QuotedMessage;
}

/**
 * Reads the reply defaults of a thread, null when it has no message but drafts. A follow-up on the
 * account's own message goes to that message's recipients, not back to the account.
 */
export async function readReplyContext({ gmail, call }: GmailClient, threadId: string): Promise<ReplyContext | null> {
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' }, call);
    const messages = (thread.data.messages ?? []).filter(message => !message.labelIds?.includes('DRAFT'));
    const last = messages.at(-1);
    if (!last?.payload) {
        return null;
    }

    const headers = last.payload.headers;
    const messageId = getHeader(headers, 'Message-ID');
    const fromMe = last.labelIds?.includes('SENT') ?? false;
    const to = fromMe ? getHeader(headers, 'To') : getHeader(headers, 'Reply-To') || getHeader(headers, 'From');
    const { html, text } = extractRawBody(last.payload);

    return {
        to,
        subject: replySubject(getHeader(headers, 'Subject')),
        inReplyTo: messageId,
        references: buildReferences(getHeader(headers, 'References'), messageId),
        quote: { from: getHeader(headers, 'From'), date: getHeader(headers, 'Date'), html, text },
    };
}
