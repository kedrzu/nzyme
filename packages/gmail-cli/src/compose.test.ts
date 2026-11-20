import { expect, test } from 'bun:test';
import {
    buildDraftBody,
    buildMime,
    buildReferences,
    collectLocalImages,
    extractBodyInner,
    imageCid,
    localImagePath,
    quoteAttribution,
    renderMarkdown,
    replySubject,
} from './compose.js';

const WARSAW_PL = { locale: 'pl-PL', timeZone: 'Europe/Warsaw' };

const decode = (message: Buffer) => message.toString('utf-8');

test('renderMarkdown: keeps single newlines as line breaks', () => {
    expect(renderMarkdown('Pozdrawiam,\nMichał')).toContain('Pozdrawiam,<br>Michał');
});

test('renderMarkdown: styles tables inline and keeps alignment', () => {
    const html = renderMarkdown('| a | b |\n|:--|--:|\n| 1 | 2 |');
    expect(html).toContain('<table style="border-collapse:collapse');
    expect(html).toMatch(/<td align="right" style="border:1px solid #ccc/);
    expect(html).toMatch(/<th align="right" style="[^"]*text-align:right"/);
    expect(html).toMatch(/<td align="right" style="[^"]*text-align:right"/);
});

test('renderMarkdown: does not override an explicit style', () => {
    expect(renderMarkdown('<p style="color:red">x</p>')).toContain('<p style="color:red">');
});

test('renderMarkdown: renders lists, links and emphasis', () => {
    const html = renderMarkdown('- **a**\n- [b](https://x.pl)');
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('<a href="https://x.pl">b</a>');
    expect(html).toMatch(/<ul style=/);
});

test('reply helpers: prefixes Re: once', () => {
    expect(replySubject('Faktura')).toBe('Re: Faktura');
    expect(replySubject('RE: Faktura')).toBe('RE: Faktura');
    expect(replySubject('Odp: Faktura')).toBe('Odp: Faktura');
});

test('reply helpers: appends message id to references without duplicates', () => {
    expect(buildReferences('<a@x> <b@x>', '<c@x>')).toBe('<a@x> <b@x> <c@x>');
    expect(buildReferences('<a@x>', '<a@x>')).toBe('<a@x>');
    expect(buildReferences('', '<a@x>')).toBe('<a@x>');
});

test('reply helpers: formats the Polish attribution for a pl locale in the given time zone', () => {
    const line = quoteAttribution('Jan <jan@x.pl>', 'Mon, 28 Sep 2026 08:15:00 +0000', WARSAW_PL);
    expect(line).toBe('W dniu pon., 28 wrz 2026 o 10:15 Jan <jan@x.pl> napisał(a):');
});

test('reply helpers: formats the English Gmail attribution for any other locale', () => {
    const line = quoteAttribution('Jan <jan@x.pl>', 'Mon, 28 Sep 2026 08:15:00 +0000', {
        locale: 'en-US',
        timeZone: 'America/New_York',
    });
    expect(line).toBe('On Mon, Sep 28, 2026 at 4:15 AM Jan <jan@x.pl> wrote:');
});

test('reply helpers: drops quotes around the display name', () => {
    const line = quoteAttribution('"Jan K." <jan@x.pl>', 'Mon, 28 Sep 2026 08:15:00 +0000', WARSAW_PL);
    expect(line).toContain(' Jan K. <jan@x.pl> napisał(a):');
});

test('reply helpers: leaves the date out when the Date header is unparseable', () => {
    expect(quoteAttribution('Jan <jan@x.pl>', 'nonsense', WARSAW_PL)).toBe('Jan <jan@x.pl> napisał(a):');
    expect(quoteAttribution('Jan <jan@x.pl>', 'nonsense', { locale: 'en-GB' })).toBe('Jan <jan@x.pl> wrote:');
});

test('reply helpers: extracts the body of a full html document', () => {
    const html = '<html><head><style>p{}</style></head><body class=x><p>hi</p></body></html>';
    expect(extractBodyInner(html)).toBe('<p>hi</p>');
});

const quote = {
    from: 'Jan <jan@x.pl>',
    date: 'Mon, 28 Sep 2026 08:15:00 +0000',
    html: '<html><body><p>Pytanie?</p></body></html>',
    text: 'Pytanie?\nDruga linia',
};

test('buildDraftBody: orders content, signature, quote', () => {
    const { html } = buildDraftBody({
        body: 'Odpowiedź',
        signatureHtml: '<b>Michał</b>',
        quote,
    });
    const iContent = html.indexOf('Odpowiedź');
    const iSig = html.indexOf('gmail_signature');
    const iQuote = html.indexOf('gmail_quote');
    expect(iContent).toBeGreaterThan(-1);
    expect(iSig).toBeGreaterThan(iContent);
    expect(iQuote).toBeGreaterThan(iSig);
    expect(html).toContain('<p>Pytanie?</p>');
    expect(html).not.toContain('<body>');
});

test('buildDraftBody: builds a plain-text alternative with signature and quote', () => {
    const { text } = buildDraftBody({
        body: 'Odpowiedź',
        signatureHtml: '<b>Michał</b>',
        quote,
        attribution: WARSAW_PL,
    });
    expect(text).toContain('Odpowiedź\n\n-- \n**Michał**');
    expect(text).toContain('> Pytanie?\n> Druga linia');
});

test('buildDraftBody: passes raw html through', () => {
    const { html, text } = buildDraftBody({ body: '<p>a</p>', bodyFormat: 'html' });
    expect(html).toBe('<div dir="ltr"><p>a</p></div>');
    expect(text).toBe('a');
});

test('buildDraftBody: inlines local images from the content only', () => {
    const { html, text, images } = buildDraftBody({
        body: 'Zdjęcie:\n\n![szafa](</Users/x/Mobile Documents/szafa 1.png>)\n\n![logo](https://x.pl/l.png)',
        signatureHtml: '<img src="https://sig/s.png">',
        quote: { ...quote, html: '<p><img src="cid:ii_abc"></p>' },
    });
    const cid = imageCid('/Users/x/Mobile Documents/szafa 1.png');
    expect(images).toEqual([{ path: '/Users/x/Mobile Documents/szafa 1.png', cid }]);
    expect(html).toContain(`src="cid:${cid}"`);
    expect(html).toContain('src="https://x.pl/l.png"');
    expect(html).toContain('src="https://sig/s.png"');
    expect(html).toContain('src="cid:ii_abc"');
    expect(text).toContain('[image: szafa]');
    expect(text).toContain('![logo](https://x.pl/l.png)');
    expect(text).not.toContain('/Users/x');
});

test('buildDraftBody: inlines local images in html bodies too', () => {
    const { html, text, images } = buildDraftBody({
        body: '<p><img src="/tmp/a.png"></p>',
        bodyFormat: 'html',
    });
    expect(images).toHaveLength(1);
    expect(html).toContain(`<img style="max-width:100%" src="cid:${imageCid('/tmp/a.png')}">`);
    expect(text).toBe('[image: a.png]');
});

test('local images: recognises local paths only', () => {
    expect(localImagePath('/a/b%20c.png')).toBe('/a/b c.png');
    expect(localImagePath('file:///a/b%20c.png')).toBe('/a/b c.png');
    expect(localImagePath('obsidian/x&amp;y.png')).toBe('obsidian/x&y.png');
    expect(localImagePath('zdj%C4%99cie.jpg')).toBe('zdjęcie.jpg');
    expect(localImagePath('https://x.pl/a.png')).toBeNull();
    expect(localImagePath('data:image/png;base64,AAA')).toBeNull();
    expect(localImagePath('cid:abc@x')).toBeNull();
    expect(localImagePath('//cdn.x.pl/a.png')).toBeNull();
});

test('local images: attaches the same file once and keeps an explicit style', () => {
    const { html, images } = collectLocalImages('<img src="/a.png" alt="1"><img style="width:50px" src="/a.png">');
    expect(images).toHaveLength(1);
    expect(html.match(/cid:/g)).toHaveLength(2);
    expect(html).toContain('<img style="width:50px" src="cid:');
});

test('buildMime: builds multipart/alternative with encoded headers, bcc and threading', async () => {
    const raw = decode(
        await buildMime({
            to: 'Jan <jan@x.pl>',
            bcc: 'ukryty@x.pl',
            subject: 'Zażółć gęślą jaźń',
            html: '<p>Cześć</p>',
            text: 'Cześć',
            inReplyTo: '<c@x>',
            references: '<a@x> <c@x>',
        }),
    );
    expect(raw).toMatch(/^Content-Type: multipart\/alternative/m);
    expect(raw).toMatch(/^Content-Type: text\/plain; charset=utf-8/m);
    expect(raw).toMatch(/^Content-Type: text\/html; charset=utf-8/m);
    expect(raw).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(raw).toMatch(/^Bcc: ukryty@x\.pl/m);
    expect(raw).toMatch(/^In-Reply-To: <c@x>/m);
    expect(raw).toMatch(/^References: <a@x> <c@x>/m);
    expect(raw).toMatch(/^MIME-Version: 1\.0/m);
    expect(raw).not.toMatch(/^From:/m);
});

test('buildMime: lays out inline images and files exactly like Gmail', async () => {
    const raw = decode(
        await buildMime({
            to: 'jan@x.pl',
            subject: 'Zdjęcia',
            html: '<p><img src="cid:ii_abc123"></p>',
            text: '[image: a]',
            attachments: [
                { filename: 'a.png', content: Buffer.from('png'), cid: 'ii_abc123' },
                { filename: 'oferta.pdf', content: Buffer.from('pdf') },
            ],
        }),
    );
    // mixed > related > (alternative(text, html), image), then the pdf.
    const order = [
        /^Content-Type: multipart\/mixed/m,
        /^Content-Type: multipart\/related/m,
        /^Content-Type: multipart\/alternative/m,
        /^Content-Type: text\/plain/m,
        /^Content-Type: text\/html/m,
        /^Content-Type: image\/png/m,
        /^Content-Type: application\/pdf/m,
    ].map(re => raw.search(re));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    // Gmail's composer only re-embeds an image carrying both ids on send.
    expect(raw).toMatch(/^Content-ID: <ii_abc123>/m);
    expect(raw).toMatch(/^X-Attachment-Id: ii_abc123/m);
    expect(raw).toMatch(/^Content-Disposition: attachment; filename=a\.png/m);
    expect(raw).toMatch(/^Content-Disposition: attachment; filename=oferta\.pdf/m);
});

test("buildMime: skips the wrappers it doesn't need", async () => {
    const onlyInline = decode(
        await buildMime({
            subject: 'x',
            html: '<img src="cid:ii_a">',
            text: 'x',
            attachments: [{ filename: 'a.png', content: Buffer.from('p'), cid: 'ii_a' }],
        }),
    );
    expect(onlyInline).toMatch(/^Content-Type: multipart\/related/m);
    expect(onlyInline).not.toMatch(/multipart\/mixed/);

    const onlyFile = decode(
        await buildMime({
            subject: 'x',
            html: '<p>x</p>',
            text: 'x',
            attachments: [{ filename: 'a.pdf', content: Buffer.from('p') }],
        }),
    );
    expect(onlyFile).toMatch(/^Content-Type: multipart\/mixed/m);
    expect(onlyFile).not.toMatch(/multipart\/related/);
});
