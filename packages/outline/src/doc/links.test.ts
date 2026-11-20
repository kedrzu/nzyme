import { expect, test } from 'bun:test';

import { findLocalAttachments, toLocalLinks, toOutlineLinks } from './links.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '1f8fad5b-d9cb-469f-a165-70867728950f';

test('Outline attachment links become local paths named after the link text, and back, byte for byte', () => {
    const remote = [
        `![Zrzut ekranu](/api/attachments.redirect?id=${ID})`,
        `![Wykres.PNG](/api/attachments.redirect?id=${ID2} " =200x100")`,
        `[umowa.pdf 120 kB](/api/attachments.redirect?id=${ID})`,
        `![](/api/attachments.redirect?id=${ID})`,
        'zwykły [link](https://example.com/a) i ![x](https://example.com/a.png)',
    ].join('\n');

    const local = toLocalLinks(remote);

    expect(local).toContain(`![Zrzut ekranu](_attachments/${ID}-zrzut-ekranu)`);
    expect(local).toContain(`![Wykres.PNG](_attachments/${ID2}-wykres.png " =200x100")`);
    expect(local).toContain(`![](_attachments/${ID})`);
    expect(local).toContain('[link](https://example.com/a)');
    expect(toOutlineLinks(local)).toBe(remote);
});

test('the absolute form is read as the relative one, so a pulled document never differs from what was pushed', () => {
    const absolute = `![a](https://healed.getoutline.com/api/attachments.redirect?id=${ID})`;
    const relative = `![a](/api/attachments.redirect?id=${ID})`;

    expect(toLocalLinks(absolute)).toBe(toLocalLinks(relative));
    expect(toOutlineLinks(toLocalLinks(absolute))).toBe(relative);
});

test('local links without an Outline id are left untouched by both directions', () => {
    const text = '![nowy](_attachments/nowy.png)\n![inny](obrazy/foto.jpg)\n[inny dok](../inny.md)';

    expect(toOutlineLinks(text)).toBe(text);
    expect(toLocalLinks(text)).toBe(text);
});

test('findLocalAttachments lists new local images and unuploaded _attachments links, and nothing else', () => {
    const text = [
        `![uploaded](_attachments/${ID}-x.png)`,
        '![nowy](_attachments/nowy.png)',
        '![foto](obrazy/foto.jpg "podpis")',
        '[plik](_attachments/raport.pdf)',
        '[dokument](../inny.md)',
        '![web](https://example.com/a.png)',
        '![abs](/api/attachments.redirect?id=' + ID + ')',
        '[kotwica](#sekcja)',
    ].join('\n');

    expect(findLocalAttachments(text)).toEqual([
        { path: '_attachments/nowy.png', text: 'nowy', image: true },
        { path: 'obrazy/foto.jpg', text: 'foto', image: true },
        { path: '_attachments/raport.pdf', text: 'plik', image: false },
    ]);
});
