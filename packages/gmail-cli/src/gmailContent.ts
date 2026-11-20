// Reading mail: Gmail payloads -> Markdown with quotes and signatures stripped, plus
// the attachment list. Pure functions only (no Gmail API calls).

import type { gmail_v1 } from '@googleapis/gmail';
import { strikethrough, tables } from '@joplin/turndown-plugin-gfm';
import EmailForwardParser from 'email-forward-parser';
import EmailReplyParser from 'email-reply-parser';
import TurndownService from 'turndown';

import { assert } from '@nzyme/utils/assert.js';

import type { MessageAttachment } from './attachments.js';

export interface AttachmentInfo extends MessageAttachment {
    inline: boolean;
}

export interface ProcessedEmail {
    body: string;
    attachments: AttachmentInfo[];
}

/** HTML and plain-text bodies of a message; the HTML one is preferred when both exist. */
export interface RawBodyContent {
    html: string | null;
    text: string | null;
}

const mailTurndown = createTurndownService();
const draftTurndown = createDraftTurndownService();

/**
 * Decodes the base64url data Gmail puts in message bodies.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Value of a header by case-insensitive name, empty when absent.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
    return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

/**
 * File size for display, e.g. "1.5 KB".
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Content-ID of an image embedded in the HTML, null for a regular attachment.
 * Neither header decides: Gmail gives every attachment a Content-ID and writes
 * "attachment" disposition for pasted images too - only a cid: reference does.
 * @__NO_SIDE_EFFECTS__
 */
export function inlineCid(part: gmail_v1.Schema$MessagePart, html: string | null): string | null {
    const cid = getHeader(part.headers, 'Content-ID').replace(/^<|>$/g, '');
    return cid && html?.includes(`cid:${cid}`) ? cid : null;
}

/**
 * Lists the attachments of a message payload, flagging the ones embedded in its HTML.
 * @__NO_SIDE_EFFECTS__
 */
export function extractAttachments(payload: gmail_v1.Schema$MessagePart): AttachmentInfo[] {
    const attachments: AttachmentInfo[] = [];
    const { html } = extractRawBody(payload);

    function scanParts(part: gmail_v1.Schema$MessagePart): void {
        // An attachment has a filename and an attachmentId.
        if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
            attachments.push({
                partId: part.partId || part.body.attachmentId,
                gmailId: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                size: part.body.size || 0,
                inline: inlineCid(part, html) !== null,
            });
        }
        for (const subPart of part.parts ?? []) {
            scanParts(subPart);
        }
    }

    scanParts(payload);
    return attachments;
}

/**
 * Extracts the raw HTML and plain-text bodies of a payload, skipping attachments.
 * @__NO_SIDE_EFFECTS__
 */
export function extractRawBody(payload: gmail_v1.Schema$MessagePart): RawBodyContent {
    let html: string | null = null;
    let text: string | null = null;

    function scanParts(part: gmail_v1.Schema$MessagePart): void {
        if (part.body?.data) {
            const decoded = decodeBase64Url(part.body.data);
            if (part.mimeType === 'text/html') {
                html = decoded;
            } else if (part.mimeType === 'text/plain') {
                text = decoded;
            }
        }
        for (const subPart of part.parts ?? []) {
            if (subPart.filename && subPart.filename.length > 0) {
                continue;
            }
            scanParts(subPart);
        }
    }

    scanParts(payload);
    return { html, text };
}

/**
 * A message as Markdown with quoted replies and signatures stripped and forwards laid out, plus its
 * attachments. `rawMode` returns the unprocessed body instead.
 * @__NO_SIDE_EFFECTS__
 */
export function processEmailContent(
    payload: gmail_v1.Schema$MessagePart,
    subject: string,
    rawMode: boolean = false,
): ProcessedEmail {
    const attachments = extractAttachments(payload);
    const { html, text } = extractRawBody(payload);

    if (rawMode) {
        return { body: html || text || '', attachments };
    }

    let processedBody = '';
    if (html) {
        // Convert HTML to markdown first, then process for forwards/replies.
        processedBody = processTextContent(convertHtmlToMarkdown(html), subject);
    } else if (text) {
        processedBody = processTextContent(text, subject);
    }
    return { body: processedBody, attachments };
}

/**
 * Draft content as Markdown, without the quote and signature we regenerate.
 * @__NO_SIDE_EFFECTS__
 */
export function draftBodyToMarkdown(payload: gmail_v1.Schema$MessagePart): string {
    const { html, text } = extractRawBody(payload);
    if (html) {
        return draftTurndown
            .turndown(html)
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    return (text || '').trim();
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

function createTurndownService(): TurndownService {
    const service = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
    });

    service.remove(['style', 'script', 'head', 'meta', 'link']);

    // Gmail quote containers
    service.addRule('gmail-quote', {
        filter: node => node.nodeName === 'DIV' && (node.getAttribute('class') ?? '').includes('gmail_quote'),
        replacement: () => '',
    });

    // Outlook-style quoted content (blue border)
    service.addRule('outlook-quote', {
        filter: node => {
            if (node.nodeName !== 'DIV' && node.nodeName !== 'BLOCKQUOTE') {
                return false;
            }
            const style = node.getAttribute('style') ?? '';
            return (
                style.includes('border-left') &&
                (style.includes('blue') ||
                    style.includes('#00f') ||
                    style.includes('rgb(0, 0, 255)') ||
                    style.includes('#1010ff') ||
                    style.includes('border:none'))
            );
        },
        replacement: () => '',
    });

    // Images shrink to [alt-text]
    service.addRule('images', {
        filter: 'img',
        replacement: (_content, node) => {
            assert('getAttribute' in node);
            return `[${node.getAttribute('alt') || 'image'}]`;
        },
    });
    return service;
}

// Drafts are read back for editing: drop the Gmail signature too (the update regenerates it), so the
// caller only sees the content it wrote. Tables stay Markdown tables here (not in mail reading, where
// layout tables would be noise).
function createDraftTurndownService(): TurndownService {
    const service = createTurndownService();
    // Our own Markdown must survive a read -> update round trip.
    service.use([tables, strikethrough]);
    // Images stay images (inline ones as ![alt](cid:...)), so an update keeps them.
    service.addRule('draft-image', {
        filter: 'img',
        replacement: (_content, node) => {
            assert('getAttribute' in node);
            return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src')})`;
        },
    });
    service.addRule('gmail-signature', {
        filter: node => /\bgmail_signature(_prefix)?\b/.test(node.getAttribute('class') ?? ''),
        replacement: () => '',
    });
    return service;
}

function convertHtmlToMarkdown(html: string): string {
    if (!html || html.trim() === '') {
        return '';
    }

    try {
        return mailTurndown
            .turndown(html)
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .replace(/^\s+|\s+$/g, ''); // Trim
    } catch (error) {
        // Fallback: strip HTML tags
        console.error('HTML to markdown conversion failed:', error);
        return stripHtmlTags(html);
    }
}

function stripHtmlTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Handles forwards and strips replies/signatures.
function processTextContent(text: string, subject: string): string {
    if (!text || text.trim() === '') {
        return '';
    }

    try {
        const forwardResult = new EmailForwardParser().read(text, subject);

        if (forwardResult.forwarded && forwardResult.email) {
            const forwardingMessage = forwardResult.message?.trim() || '';
            const originalEmail = forwardResult.email;

            let output = '';

            // What the person wrote when forwarding
            if (forwardingMessage) {
                output += forwardingMessage + '\n\n';
            }

            output += '---\n**Forwarded Email**\n';
            if (originalEmail.from?.address) {
                output += `From: ${originalEmail.from.name ? `${originalEmail.from.name} <${originalEmail.from.address}>` : originalEmail.from.address}\n`;
            }
            if (originalEmail.to) {
                const toArray = Array.isArray(originalEmail.to) ? originalEmail.to : [originalEmail.to];
                const toAddresses = toArray.map(t => (t.name ? `${t.name} <${t.address}>` : t.address)).join(', ');
                output += `To: ${toAddresses}\n`;
            }
            if (originalEmail.date) {
                output += `Date: ${originalEmail.date}\n`;
            }
            if (originalEmail.subject) {
                output += `Subject: ${originalEmail.subject}\n`;
            }
            output += '\n';

            // The original email body, with its own quotes/signatures stripped too
            if (originalEmail.body) {
                output += new EmailReplyParser().read(originalEmail.body).getVisibleText();
            }

            return output.trim();
        }

        // Not a forward - strip quoted replies and signatures
        return new EmailReplyParser().read(text).getVisibleText().trim();
    } catch (error) {
        console.error('Text processing failed:', error);
        return text; // Return original on error
    }
}
