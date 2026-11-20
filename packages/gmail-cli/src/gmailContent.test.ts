import { expect, test } from 'bun:test';

import type { gmail_v1 } from '@googleapis/gmail';

import { draftBodyToMarkdown, processEmailContent } from './gmailContent.js';

test('a reply renders as Markdown without the quoted history', () => {
    const payload = htmlPayload(
        '<div dir="ltr"><p>Yes, <b>Tuesday</b> works.</p></div>' +
            '<div class="gmail_quote"><div class="gmail_attr">On Mon, Jan <jan@x.pl> wrote:</div>' +
            '<blockquote class="gmail_quote"><p>Can we meet this week?</p></blockquote></div>',
    );

    const { body } = processEmailContent(payload, 'Meeting');

    expect(body).toBe('Yes, **Tuesday** works.');
});

test('a plain-text reply drops the quote and the signature', () => {
    const payload = textPayload(
        [
            'Yes, Tuesday works.',
            '',
            'On Mon, 28 Sep 2026 at 10:15, Jan <jan@x.pl> wrote:',
            '> Can we meet this week?',
            '',
            '-- ',
            'Jan Kowalski',
        ].join('\n'),
    );

    const { body } = processEmailContent(payload, 'Meeting');

    expect(body).toBe('Yes, Tuesday works.');
});

test('the signature Gmail inserts is dropped when a draft is read back', () => {
    const payload = htmlPayload(
        '<div dir="ltr"><p>Draft text</p><br clear="all"><div><br></div>' +
            '<span class="gmail_signature_prefix">-- </span><br>' +
            '<div dir="ltr" class="gmail_signature"><b>Michał</b></div></div>',
    );

    expect(draftBodyToMarkdown(payload)).toBe('Draft text');
});

test('attachments are listed and flagged inline only when the HTML references their cid', () => {
    const payload: gmail_v1.Schema$MessagePart = {
        mimeType: 'multipart/mixed',
        parts: [
            htmlPayload('<p><img src="cid:logo123"></p>'),
            attachmentPart('1', 'logo.png', '<logo123>'),
            attachmentPart('2', 'report.pdf', '<report456>'),
        ],
    };

    const { attachments } = processEmailContent(payload, 'Files');

    expect(attachments.map(a => [a.partId, a.filename, a.inline])).toEqual([
        ['1', 'logo.png', true],
        ['2', 'report.pdf', false],
    ]);
});

function htmlPayload(html: string): gmail_v1.Schema$MessagePart {
    return { mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url') } };
}

function textPayload(text: string): gmail_v1.Schema$MessagePart {
    return { mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url') } };
}

function attachmentPart(partId: string, filename: string, contentId: string): gmail_v1.Schema$MessagePart {
    return {
        partId,
        filename,
        mimeType: 'application/octet-stream',
        headers: [{ name: 'Content-ID', value: contentId }],
        body: { attachmentId: `gmail-${partId}`, size: 10 },
    };
}
