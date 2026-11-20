import { expect, test } from 'bun:test';

import { parseDocFile, serializeDocFile } from './codec.js';
import type { DocFile } from './codec.js';

const FILE = `---
outline: 7f3c1b2e-0000-4000-8000-000000000001
shared: [Franek Nowak, zespol, ania@healed.pl]
---
# Zażółć gęślą jaźń

Pierwszy akapit.

Drugi akapit.
`;

test('frontmatter never appears in the text sent to Outline: the body starts after the title and holds no --- block', () => {
    const { doc, issues } = parseDocFile(FILE, 'zazolc.md');

    expect(issues).toEqual([]);
    expect(doc.title).toBe('Zażółć gęślą jaźń');
    expect(doc.text).toBe('Pierwszy akapit.\n\nDrugi akapit.\n');
    expect(doc.text).not.toContain('outline:');
    expect(doc.text).not.toContain('---');
    expect(doc.id).toBe('7f3c1b2e-0000-4000-8000-000000000001');
    expect(doc.shared).toEqual(['Franek Nowak', 'zespol', 'ania@healed.pl']);
});

test('a file the sync wrote reads back to the same document and serialises to the same bytes', () => {
    const docs: DocFile[] = [
        {
            id: 'abc',
            shared: ['Ania, Kowalska', 'true', 'x: y'],
            title: 'Tytuł: "z" # znakami',
            text: 'a\n\n\nb',
            extra: {},
        },
        { id: 'abc', shared: [], title: 'T', text: '', extra: { tags: ['a', 'b'], owner: { name: 'Ola' }, n: 3 } },
        { shared: [], title: 'Nowy', text: '\n\nzaczyna się pustą linią\n', extra: {} },
        { id: '12345', shared: [], title: '  spacje  ', text: 'x', extra: {} },
        { id: 'abc', shared: ['a'], title: 'Z kodem', text: '```\n---\n# nie tytuł\n```\n', extra: {} },
    ];

    for (const doc of docs) {
        const written = serializeDocFile(doc);
        const { doc: read, issues } = parseDocFile(written, 'x.md');
        expect(issues).toEqual([]);
        expect(read).toEqual(doc);
        expect(serializeDocFile(read)).toBe(written);
    }
});

test('the documented file format is what gets written', () => {
    const { doc } = parseDocFile(FILE, 'x.md');
    expect(serializeDocFile(doc)).toBe(FILE);
});

test('a brand-new file without frontmatter has no id and nothing shared, and none is written for it', () => {
    const { doc, issues } = parseDocFile('# Nowa notatka\n\ntreść\n', 'nowa.md');

    expect(issues).toEqual([]);
    expect(doc).toEqual({ id: undefined, shared: [], title: 'Nowa notatka', text: 'treść\n', extra: {} });
    expect(serializeDocFile(doc)).toBe('# Nowa notatka\n\ntreść\n');
});

test('a missing # line is reported and the title comes from the file name, with the body untouched', () => {
    const { doc, issues } = parseDocFile('Tylko treść.\n\n## Podtytuł\n', 'oferta-dla-kliniki.md');

    expect(issues.map(issue => issue.kind)).toEqual(['missing-title']);
    expect(doc.title).toBe('oferta dla kliniki');
    expect(doc.text).toBe('Tylko treść.\n\n## Podtytuł\n');
});

test('invalid frontmatter is reported and the body still comes back intact, never dropped with it', () => {
    const cases = [
        '---\noutline: [unclosed\n---\n# T\n\nbody\n',
        '---\nshared: Ania\n---\n# T\n\nbody\n',
        '---\nshared: [1, 2]\n---\n# T\n\nbody\n',
        '---\n- a\n- b\n---\n# T\n\nbody\n',
        '---\noutline: abc\n# T\n\nbody\n',
    ];

    for (const file of cases) {
        const { doc, issues } = parseDocFile(file, 'x.md');
        expect(issues.map(issue => issue.kind)).toContain('invalid-frontmatter');
        expect(doc.shared).toEqual([]);
        if (file.includes('---\n# T')) {
            expect(doc.title).toBe('T');
            expect(doc.text).toBe('body\n');
        } else {
            expect(doc.text).toContain('body');
        }
    }
});
