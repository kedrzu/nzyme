import { expect, test } from 'bun:test';

import { assignPaths, DRAFTS_FOLDER, SHARED_FOLDER } from './tree.js';
import type { TreeDocument, TreeInput } from './tree.js';

function doc(id: string, title: string, extra: Partial<TreeDocument> = {}): TreeDocument {
    return { id, title, collectionId: 'c1', parentId: null, published: true, ...extra };
}

function input(documents: TreeDocument[], extra: Partial<TreeInput> = {}): TreeInput {
    return {
        documents,
        collections: [{ id: 'c1', name: 'Oferty Zespołu' }],
        state: { documents: {}, collections: {} },
        ...extra,
    };
}

test('new documents get slug names; a document with children has a folder named like its file', () => {
    const { paths, collections } = assignPaths(
        input([
            doc('a', 'Oferta dla kliniki'),
            doc('b', 'Cennik', { parentId: 'a' }),
            doc('c', 'Szczegóły', { parentId: 'b' }),
        ]),
    );

    expect(collections).toEqual({ c1: 'oferty-zespolu' });
    expect(paths.get('a')).toBe('oferty-zespolu/oferta-dla-kliniki.md');
    expect(paths.get('b')).toBe('oferty-zespolu/oferta-dla-kliniki/cennik.md');
    expect(paths.get('c')).toBe('oferty-zespolu/oferta-dla-kliniki/cennik/szczegoly.md');
});

test('same titles in one folder and same-named collections get distinct names, in a stable order', () => {
    const { paths, collections } = assignPaths(
        input(
            [
                doc('a', 'Notatki', { createdAt: '2026-02-01T00:00:00.000Z' }),
                doc('b', 'Notatki', { createdAt: '2026-01-01T00:00:00.000Z' }),
                doc('c', 'Notatki', { collectionId: 'c2', createdAt: '2026-03-01T00:00:00.000Z' }),
            ],
            {
                collections: [
                    { id: 'c1', name: 'Zespół' },
                    { id: 'c2', name: 'zespol' },
                ],
            },
        ),
    );

    expect(paths.get('b')).toBe('zespol/notatki.md');
    expect(paths.get('a')).toBe('zespol/notatki-2.md');
    expect(collections).toEqual({ c1: 'zespol', c2: 'zespol-2' });
    expect(paths.get('c')).toBe('zespol-2/notatki.md');
});

test('a collection named like a reserved folder does not take it', () => {
    const { collections } = assignPaths(input([doc('a', 'X')], { collections: [{ id: 'c1', name: 'Drafts' }] }));

    expect(collections.c1).toBe('drafts-2');
});

test('names assigned earlier survive a title change, and a title change alone does not move anything', () => {
    const { paths, collections } = assignPaths(
        input([doc('a', 'Całkiem nowy tytuł'), doc('b', 'Inne', { parentId: 'a' })], {
            collections: [{ id: 'c1', name: 'Nowa nazwa kolekcji' }],
            state: {
                documents: { a: { path: 'stary/stara-nazwa.md' }, b: { path: 'stary/stara-nazwa/inne.md' } },
                collections: { c1: 'stary' },
            },
        }),
    );

    expect(collections).toEqual({ c1: 'stary' });
    expect(paths.get('a')).toBe('stary/stara-nazwa.md');
    expect(paths.get('b')).toBe('stary/stara-nazwa/inne.md');
});

test('a move changes the folder and keeps the file name; the children follow', () => {
    const { paths } = assignPaths(
        input([doc('a', 'A'), doc('p', 'Parent'), doc('b', 'B', { parentId: 'p' })], {
            state: {
                documents: {
                    a: { path: 'kol/a.md' },
                    p: { path: 'kol/parent.md' },
                    b: { path: 'kol/b.md' },
                },
                collections: { c1: 'kol' },
            },
        }),
    );

    expect(paths.get('b')).toBe('kol/parent/b.md');
    expect(paths.get('a')).toBe('kol/a.md');
});

test('a moved document whose name is taken in the new folder gets a suffix, never displacing the resident', () => {
    const { paths } = assignPaths(
        input([doc('resident', 'Notes', { parentId: 'p' }), doc('p', 'P'), doc('mover', 'Notes', { parentId: 'p' })], {
            state: {
                documents: {
                    p: { path: 'kol/p.md' },
                    resident: { path: 'kol/p/notes.md' },
                    mover: { path: 'kol/notes.md' },
                },
                collections: { c1: 'kol' },
            },
        }),
    );

    expect(paths.get('resident')).toBe('kol/p/notes.md');
    expect(paths.get('mover')).toBe('kol/p/notes-2.md');
});

test('a name kept by a document that left the set is not given to a new one', () => {
    const { paths } = assignPaths(
        input([doc('new', 'Offer')], {
            state: { documents: { gone: { path: 'kol/offer.md' } }, collections: { c1: 'kol' } },
        }),
    );

    expect(paths.get('new')).toBe('kol/offer-2.md');
});

test('drafts go to the drafts folder, and documents of an invisible collection or parent to shared-with-me', () => {
    const { paths, collections } = assignPaths(
        input(
            [
                doc('d', 'Szkic', { collectionId: null, published: false }),
                doc('s', 'Udostępniony', { collectionId: 'hidden' }),
                doc('t', 'Pod nim', { collectionId: 'hidden', parentId: 's' }),
                doc('o', 'Osierocony', { parentId: 'missing' }),
            ],
            { collections: [] },
        ),
    );

    expect(paths.get('d')).toBe(`${DRAFTS_FOLDER}/szkic.md`);
    expect(paths.get('s')).toBe(`${SHARED_FOLDER}/udostepniony.md`);
    expect(paths.get('t')).toBe(`${SHARED_FOLDER}/udostepniony/pod-nim.md`);
    expect(paths.get('o')).toBe(`${SHARED_FOLDER}/osierocony.md`);
    expect(collections).toEqual({});
});
