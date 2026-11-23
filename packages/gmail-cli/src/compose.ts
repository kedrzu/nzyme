// Draft composition: Markdown -> Gmail-looking HTML, signature, reply quote, MIME.
//
// Pure functions only (no Gmail API calls), so the whole draft shape is unit-testable. The helpers
// are used only together to build one draft, so they share this file.

import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Marked } from 'marked';
import { detectMimeType } from 'nodemailer/lib/mime-funcs/mime-types';
import MimeNode from 'nodemailer/lib/mime-node';
import TurndownService from 'turndown';

import { assert } from '@nzyme/utils/assert.js';
import { immutable } from '@nzyme/utils/immutable.js';

import { escapeHtml } from './utils/escapeHtml.js';

export type BodyFormat = 'markdown' | 'html';

// Inline styles only where Gmail's defaults look broken; no font-family, so the
// draft keeps the account's default compose font and reads like a hand-written mail.
const TAG_STYLES = immutable<Record<string, string>>({
    p: 'margin:0 0 1em 0',
    table: 'border-collapse:collapse;margin:0 0 1em 0',
    th: 'border:1px solid #ccc;padding:4px 8px',
    td: 'border:1px solid #ccc;padding:4px 8px',
    blockquote: 'margin:0 0 1em 0.8ex;border-left:1px solid #ccc;padding-left:1ex',
    pre: 'font-family:monospace;white-space:pre-wrap;margin:0 0 1em 0',
    code: 'font-family:monospace',
    ul: 'margin:0 0 1em 0',
    ol: 'margin:0 0 1em 0',
    hr: 'border:none;border-top:1px solid #ccc',
    img: 'max-width:100%',
});

/**
 * Renders Markdown to HTML with the inline styles Gmail needs to look right.
 * @__NO_SIDE_EFFECTS__
 */
export function renderMarkdown(md: string): string {
    const html = new Marked({ gfm: true, breaks: true }).parse(md, { async: false });
    return addInlineStyles(html.trim());
}

/**
 * Plain-text rendering of HTML for the text/plain alternative.
 * @__NO_SIDE_EFFECTS__
 */
export function htmlToPlain(html: string): string {
    return createPlainTurndown()
        .turndown(html)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Inner part of `<body>`, so a full HTML document can be embedded in a quote.
 * @__NO_SIDE_EFFECTS__
 */
export function extractBodyInner(html: string): string {
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const inner = body?.[1] ?? html;
    return inner
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .replace(/<\/?html[^>]*>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .trim();
}

// ----------------------------------------------------------------------------
// Local images -> inline (cid) parts
// ----------------------------------------------------------------------------

/**
 * Image src pointing at a file on disk (absolute, relative or file://), decoded;
 * null for anything the mail client fetches itself (http:, data:, cid:, //host).
 * @__NO_SIDE_EFFECTS__
 */
export function localImagePath(src: string): string | null {
    const s = decodeEntities(src.trim());
    if (!s) {
        return null;
    }
    if (/^file:/i.test(s)) {
        try {
            return fileURLToPath(s);
        } catch {
            return null;
        }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) {
        return null;
    }
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

/** A local image the body refers to, and the cid it is attached under. */
export interface InlineImageRef {
    /** As written in the body (resolved against the file roots later). */
    path: string;
    cid: string;
}

/**
 * Gmail's own inline-image id ("ii_" + hex). The web composer only re-embeds
 * images whose Content-ID/X-Attachment-Id look like this when the draft is sent;
 * any other cid ends up as a dead mail.google.com link in the sent mail.
 * Same path gives the same id, so an image used twice is attached once.
 * @__NO_SIDE_EFFECTS__
 */
export function imageCid(filePath: string): string {
    return `ii_${createHash('sha1').update(filePath).digest('hex').slice(0, 20)}`;
}

/** The result of {@link collectLocalImages}. */
export interface CollectedImages {
    /** The HTML with local image sources rewritten to `cid:` references. */
    html: string;
    images: InlineImageRef[];
}

/**
 * Rewrites `<img src="local path">` to cid: references and lists the files to attach.
 * @__NO_SIDE_EFFECTS__
 */
export function collectLocalImages(html: string): CollectedImages {
    const images: InlineImageRef[] = [];
    const out = html.replace(/<img\b[^>]*>/gi, tag => {
        const src = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        const value = src?.[1] ?? src?.[2];
        if (!src || value === undefined) {
            return tag;
        }
        const filePath = localImagePath(value);
        if (filePath === null) {
            return tag;
        }
        const cid = imageCid(filePath);
        if (!images.some(i => i.cid === cid)) {
            images.push({ path: filePath, cid });
        }
        let result = tag.replace(src[0], ` src="cid:${cid}"`);
        if (!/\sstyle\s*=/i.test(result)) {
            result = result.replace(/^<img\b/i, '<img style="max-width:100%"');
        }
        return result;
    });
    return { html: out, images };
}

// ----------------------------------------------------------------------------
// Reply helpers
// ----------------------------------------------------------------------------

/**
 * Subject of a reply: prefixed with "Re: " unless it already carries a reply prefix.
 * @__NO_SIDE_EFFECTS__
 */
export function replySubject(subject: string): string {
    const s = subject.trim();
    return /^(re|odp|aw|sv)\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * References header of a reply: the parent's references plus its message id, without duplicates.
 * @__NO_SIDE_EFFECTS__
 */
export function buildReferences(references: string, messageId: string): string {
    const ids = references.split(/\s+/).filter(Boolean);
    if (messageId && !ids.includes(messageId)) {
        ids.push(messageId);
    }
    return ids.join(' ');
}

/** The message a reply quotes under its body. */
export interface QuotedMessage {
    /** Raw From header, e.g. "Jan Kowalski <jan@x.pl>". */
    from: string;
    /** Raw Date header. */
    date: string;
    /** HTML body; preferred over `text` when present. */
    html: string | null;
    /** Plain-text body. */
    text: string | null;
}

/** How the attribution line of a reply quote is written. */
export interface QuoteAttributionOptions {
    /** BCP 47 tag; defaults to the system locale. `pl` gets the Polish template, any other the English one. */
    locale?: string;
    /** IANA time zone the date is shown in; defaults to the system time zone. */
    timeZone?: string;
}

/** Arguments of {@link quoteAttribution}. */
export interface QuoteAttributionParams extends QuoteAttributionOptions {
    /** Raw From header of the quoted message. */
    from: string;
    /** Raw Date header of the quoted message. */
    date: string;
}

/**
 * Gmail's reply attribution line: "On Mon, Sep 28, 2026 at 10:15 AM Jan <jan@x.pl> wrote:", or for a `pl`
 * locale "W dniu pon., 28 wrz 2026 o 10:15 Jan <jan@x.pl> napisał(a):". The date is formatted in the
 * locale and time zone, and left out when the Date header cannot be parsed.
 * @__NO_SIDE_EFFECTS__
 */
export function quoteAttribution(params: QuoteAttributionParams): string {
    const { date } = params;
    // '"Jan Kowalski" <jan@x.pl>' -> 'Jan Kowalski <jan@x.pl>', as Gmail shows it.
    const from = params.from.replace(/^"(.*)"(\s*<)/, '$1$2');
    const system = Intl.DateTimeFormat().resolvedOptions();
    const locale = params.locale ?? system.locale;
    const timeZone = params.timeZone ?? system.timeZone;
    const isPolish = new Intl.Locale(locale).language === 'pl';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
        return isPolish ? `${from} napisał(a):` : `${from} wrote:`;
    }

    const part = (opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, { ...opts, timeZone });
    const time = d.toLocaleTimeString(locale, {
        hour: isPolish ? '2-digit' : 'numeric',
        minute: '2-digit',
        timeZone,
    });
    if (isPolish) {
        const weekday = part({ weekday: 'short' });
        const day = part({ day: 'numeric' });
        const month = part({ month: 'short' });
        const year = part({ year: 'numeric' });
        return `W dniu ${weekday}, ${day} ${month} ${year} o ${time} ${from} napisał(a):`;
    }
    const day = part({ weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    return `On ${day} at ${time} ${from} wrote:`;
}

/**
 * The quoted parent message as Gmail's `gmail_quote` HTML block.
 * @__NO_SIDE_EFFECTS__
 */
export function buildQuoteHtml(q: QuotedMessage, options?: QuoteAttributionOptions): string {
    const content = q.html ? extractBodyInner(q.html) : escapeHtml(q.text ?? '').replace(/\r?\n/g, '<br>');
    return (
        `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">` +
        `${escapeHtml(quoteAttribution({ ...options, from: q.from, date: q.date }))}<br></div>` +
        `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">` +
        `${content}</blockquote></div>`
    );
}

/**
 * The quoted parent message for the text/plain alternative, every line prefixed with "> ".
 * @__NO_SIDE_EFFECTS__
 */
export function buildQuoteText(q: QuotedMessage, options?: QuoteAttributionOptions): string {
    const text = q.text ?? (q.html ? htmlToPlain(q.html) : '');
    const quoted = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => (line ? `> ${line}` : '>'))
        .join('\n');
    return `${quoteAttribution({ ...options, from: q.from, date: q.date })}\n\n${quoted}`;
}

// ----------------------------------------------------------------------------
// Signature
// ----------------------------------------------------------------------------

/**
 * Same markup Gmail's composer inserts, so Gmail (and our reader) recognise it.
 * @__NO_SIDE_EFFECTS__
 */
export function buildSignatureHtml(signatureHtml: string): string {
    return (
        `<br clear="all"><div><br></div>` +
        `<span class="gmail_signature_prefix">-- </span><br>` +
        `<div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${signatureHtml}</div>`
    );
}

// ----------------------------------------------------------------------------
// Full draft body
// ----------------------------------------------------------------------------

/** Input of {@link buildDraftBody}. */
export interface DraftBodyInput {
    /** The content the caller wrote, in `bodyFormat`. */
    body: string;
    /** Default `markdown`. */
    bodyFormat?: BodyFormat;
    /** The Gmail signature appended under the content; none when empty. */
    signatureHtml?: string | null;
    /** The message quoted under the signature; none when null. */
    quote?: QuotedMessage | null;
    /** Locale and time zone of the quote's attribution line. */
    attribution?: QuoteAttributionOptions;
}

/** A rendered draft body: its HTML part, its text/plain alternative and the images to attach. */
export interface DraftBody {
    html: string;
    text: string;
    /** Local images referenced by the content, to attach inline under their cid. */
    images: InlineImageRef[];
}

/**
 * Builds the HTML and text parts of a draft. The order is fixed: content, signature, quote (Gmail's
 * default placement). Only the content's images are inlined; signature and quote keep their own.
 * @__NO_SIDE_EFFECTS__
 */
export function buildDraftBody(input: DraftBodyInput): DraftBody {
    const format = input.bodyFormat ?? 'markdown';
    const { html: contentHtml, images } = collectLocalImages(
        format === 'html' ? input.body : renderMarkdown(input.body),
    );
    const contentText = format === 'html' ? htmlToPlain(input.body) : markdownImagesToPlain(input.body.trim());

    let html = `<div dir="ltr">${contentHtml}`;
    let text = contentText;

    if (input.signatureHtml && input.signatureHtml.trim()) {
        html += buildSignatureHtml(input.signatureHtml);
        text += `\n\n-- \n${htmlToPlain(input.signatureHtml)}`;
    }
    html += `</div>`;

    if (input.quote) {
        html += `<br>${buildQuoteHtml(input.quote, input.attribution)}`;
        text += `\n\n${buildQuoteText(input.quote, input.attribution)}`;
    }

    return { html, text, images };
}

// ----------------------------------------------------------------------------
// MIME
// ----------------------------------------------------------------------------

/** A file to put into a MIME message, with its bytes. */
export interface RawAttachment {
    filename: string;
    /** Detected from the extension when omitted. */
    contentType?: string;
    content: Buffer;
    /** Only for images embedded in the HTML (referenced as cid:). */
    cid?: string;
}

/** Input of {@link buildMime}: the headers, bodies and files of one message. */
export interface RawMessageInput {
    from?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    html?: string;
    /** The text/plain alternative of `html`, or the only body without it. */
    text?: string;
    inReplyTo?: string;
    references?: string;
    /** Files and inline images; a `cid` makes one inline only when there is an HTML body. */
    attachments?: RawAttachment[];
}

/**
 * Builds the RFC 822 message with the same tree as one written in Gmail:
 * mixed > related > (alternative(text, html), inline images), files. Each level only when needed.
 * Headers are RFC 2047 encoded and Bcc is kept (it is a draft).
 */
export async function buildMime(input: RawMessageInput): Promise<Buffer> {
    const attachments = input.attachments ?? [];
    const inline = input.html ? attachments.filter(a => a.cid) : [];
    const files = attachments.filter(a => !inline.includes(a));

    const root = new MimeNode(
        files.length ? 'multipart/mixed' : inline.length ? 'multipart/related' : 'multipart/alternative',
        { keepBcc: true, textEncoding: 'B' },
    );
    const related = !files.length ? root : inline.length ? root.createChild('multipart/related') : root;
    const alternative = inline.length || files.length ? related.createChild('multipart/alternative') : root;

    alternative.createChild('text/plain; charset=utf-8').setContent(input.text ?? '');
    if (input.html) {
        alternative.createChild('text/html; charset=utf-8').setContent(input.html);
    }
    for (const a of inline) {
        appendFile(related, a);
    }
    for (const a of files) {
        appendFile(root, a);
    }

    const headers: [string, string | undefined][] = [
        ['From', input.from],
        ['To', input.to],
        ['Cc', input.cc],
        ['Bcc', input.bcc],
        ['Subject', input.subject],
        ['In-Reply-To', input.inReplyTo],
        ['References', input.references],
    ];
    for (const [key, value] of headers) {
        if (value) {
            root.setHeader(key, value);
        }
    }
    root.messageId();
    return root.build();
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

// Adds a style attribute to known tags that don't already carry one.
function addInlineStyles(html: string): string {
    return html.replace(
        /<(p|table|th|td|blockquote|pre|code|ul|ol|hr|img)(\s[^>]*)?>/g,
        (tag, name: string, attrs: string | undefined) => {
            if (attrs && /\sstyle=/i.test(attrs)) {
                return tag;
            }
            let style = TAG_STYLES[name];
            assert(style);
            // Table cells: GFM column alignment as CSS (Gmail ignores align=), headers left by default.
            if (name === 'th' || name === 'td') {
                const align = attrs?.match(/\salign="(left|center|right)"/)?.[1];
                if (align || name === 'th') {
                    style += `;text-align:${align ?? 'left'}`;
                }
            }
            return `<${name}${attrs ?? ''} style="${style}">`;
        },
    );
}

function createPlainTurndown(): TurndownService {
    const service = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        linkStyle: 'inlined',
    });
    service.remove(['style', 'script', 'head']);
    // A local image path means nothing to the recipient (and leaks the sender's file layout).
    service.addRule('local-image', {
        filter: node => node.nodeName === 'IMG' && localImagePath(node.getAttribute('src') ?? '') !== null,
        replacement: (_content, node) => {
            assert('getAttribute' in node);
            return imagePlaceholder(node.getAttribute('alt') ?? '', node.getAttribute('src') ?? '');
        },
    });
    return service;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function imagePlaceholder(alt: string, src: string): string {
    const name = path.basename(localImagePath(src) ?? src);
    return `[image: ${alt.trim() || name}]`;
}

// ![alt](local path) -> [image: alt] in the plain-text part; remote images stay.
function markdownImagesToPlain(md: string): string {
    return md.replace(
        /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
        (whole, alt: string, target: string) => {
            const src = target.replace(/^<|>$/g, '');
            return localImagePath(src) === null ? whole : imagePlaceholder(alt, src);
        },
    );
}

// nodemailer would write "X-Attachment-ID"; keep Gmail's exact spelling.
function gmailHeaderCase(key: string): string {
    return key.toLowerCase() === 'x-attachment-id' ? 'X-Attachment-Id' : key;
}

function appendFile(parent: MimeNode, a: RawAttachment): void {
    const node = parent.createChild(a.contentType || detectMimeType(a.filename), {
        filename: a.filename,
        normalizeHeaderKey: gmailHeaderCase,
    });
    // Exactly what Gmail's composer writes for a pasted image: disposition
    // "attachment" plus matching Content-ID and X-Attachment-Id.
    node.setHeader('Content-Disposition', 'attachment');
    if (a.cid) {
        node.setHeader('Content-ID', `<${a.cid}>`);
        node.setHeader('X-Attachment-Id', a.cid);
    }
    node.setContent(a.content);
}
