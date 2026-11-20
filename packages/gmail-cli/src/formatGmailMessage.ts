import type { gmail_v1 } from '@googleapis/gmail';

import { assert } from '@nzyme/utils/assert.js';

import { formatFileSize, getHeader, processEmailContent } from './gmailContent.js';

/** Options of {@link formatGmailMessage}. */
export interface FormatGmailMessageOptions {
    /** Label names by id, from `readLabelNames`. */
    labelNames: Map<string, string>;
    /** The original HTML or text, without Markdown conversion or quote stripping. */
    raw: boolean;
}

/**
 * A message for an agent: a `key: value` header block (empty headers left out, labels by name, one
 * `attachment: <partId> <filename> <mimeType> <size>` line each), a blank line, then the body as
 * Markdown with quoted replies and signatures stripped.
 * @__NO_SIDE_EFFECTS__
 */
export function formatGmailMessage(message: gmail_v1.Schema$Message, options: FormatGmailMessageOptions): string {
    const { payload } = message;
    assert(payload, `Gmail returned message ${message.id} without its content`);

    const headers = payload.headers;
    const subject = getHeader(headers, 'Subject');
    const { body, attachments } = processEmailContent(payload, subject, options.raw);
    const labels = (message.labelIds ?? []).map(id => options.labelNames.get(id) ?? id);

    const fields: [string, string][] = [
        ['id', message.id ?? ''],
        ['thread', message.threadId ?? ''],
        ['subject', subject],
        ['from', getHeader(headers, 'From')],
        ['to', getHeader(headers, 'To')],
        ['cc', getHeader(headers, 'Cc')],
        ['date', getHeader(headers, 'Date')],
        ['labels', labels.join(', ')],
        ...attachments.map((a): [string, string] => [
            'attachment',
            `${a.partId} ${a.filename} ${a.mimeType} ${formatFileSize(a.size)}`,
        ]),
    ];
    const lines = fields
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value.replace(/\s*[\r\n]+\s*/g, ' ')}`);

    return `${lines.join('\n')}\n\n${body}\n`;
}
