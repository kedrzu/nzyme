import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { checkPen } from './checkPen.js';
import type { PenConflict, PenConflictNode } from './mergePen.js';
import { mergePen } from './mergePen.js';
import type { PenDocument, PenNode } from './PenDocument.js';
import { indexPen, parsePen, serializePen } from './PenDocument.js';

const FIXTURE = readFileSync(new URL('./__fixtures__/document.pen', import.meta.url), 'utf8');

const SCREEN = { id: 'screen', name: 'Screen · Inbox' };
const COMPONENTS = { id: 'components', name: 'Components' };

/** One change of every kind a side can make on its own. */
const ONE_SIDED_CHANGES: [string, Mutation][] = [
    ['a property', doc => (node(doc, 'row').name = 'Row (renamed)')],
    ['a property added between others', doc => insertKey(node(doc, 'tagIcon'), 'icon', 'opacity', 0.5)],
    ['a property removed', doc => delete node(doc, 'tagIcon').fill],
    ['an override property', doc => (overrides(doc, 'saveButton').label = { content: '$ Save', fill: '$fg' })],
    ['an override key', doc => (overrides(doc, 'saveButton').extra = { visible: false })],
    ['a replacement override', doc => (overrides(doc, 'promoCard').body = { type: 'frame', id: 'otherBody' })],
    ['a property override setting children', doc => (overrides(doc, 'promoCard').slot = { children: [] })],
    ['a variable', doc => (variables(doc).border = { type: 'color', value: '#000000' })],
    ['a top-level key', doc => (doc.fileToken = 'changed')],
    ['an added node', doc => insert(doc, 'row', 1, { type: 'text', id: 'added', content: 'New' })],
    ['an added subtree', doc => insert(doc, null, 1, frame('addedFrame', [frame('addedChild')]))],
    ['a deleted leaf', doc => remove(doc, 'tagIcon')],
    ['a deleted subtree', doc => remove(doc, 'row')],
    ['a node moved to another parent', doc => insert(doc, 'components', 0, remove(doc, 'tagIcon'))],
    ['reordered children', doc => insert(doc, 'screen', 2, remove(doc, 'row'))],
    ['reordered top-level nodes', doc => insert(doc, null, 0, remove(doc, 'components'))],
];

test('merging a document with itself gives it back byte for byte', () => {
    const doc = parsePen(FIXTURE);

    const result = mergePen(doc, parsePen(FIXTURE), parsePen(FIXTURE));

    expect(result.conflicts).toEqual([]);
    expect(serializePen(result.doc, FIXTURE)).toBe(FIXTURE);
});

test.each(ONE_SIDED_CHANGES)('%s lands from either side without a conflict', (_name, mutation) => {
    const changed = edit(mutation);

    const fromTheirs = mergePen(edit(), edit(), changed);
    const fromOurs = mergePen(edit(), changed, edit());

    expect(fromTheirs.conflicts).toEqual([]);
    expect(serializePen(fromTheirs.doc)).toBe(serializePen(changed));
    expect(fromOurs.conflicts).toEqual([]);
    expect(serializePen(fromOurs.doc)).toBe(serializePen(changed));
});

test('changes to different things on each side all land', () => {
    const ours = [
        (doc: PenDocument) => (node(doc, 'price').content = '$10 off'),
        (doc: PenDocument) => insert(doc, 'components', 2, frame('oursNew')),
        (doc: PenDocument) => (overrides(doc, 'saveButton').label = { content: '$ Save', fill: '$fg' }),
        (doc: PenDocument) => (variables(doc).bg = { type: 'color', value: '#000000' }),
    ];
    const theirs = [
        (doc: PenDocument) => (node(doc, 'button').cornerRadius = 8),
        (doc: PenDocument) => remove(doc, 'tagIcon'),
        (doc: PenDocument) => insert(doc, 'screen', 2, remove(doc, 'row')),
        (doc: PenDocument) => (overrides(doc, 'saveButton').label = { content: '$ Store', fill: '$accent' }),
        (doc: PenDocument) => (variables(doc).fg = { type: 'color', value: '#FFFFFF' }),
    ];

    const result = mergePen(edit(), edit(...ours), edit(...theirs));

    const expected = edit(
        ...ours,
        ...theirs,
        doc => (overrides(doc, 'saveButton').label = { content: '$ Store', fill: '$fg' }),
    );
    expect(result.conflicts).toEqual([]);
    expect(serializePen(result.doc)).toBe(serializePen(expected));
});

test('nodes inserted at the same place on both sides are both kept, theirs first', () => {
    const result = mergePen(
        edit(),
        edit(doc => insert(doc, 'row', 1, text('oursText'))),
        edit(doc => insert(doc, 'row', 1, text('theirsText'))),
    );

    expect(result.conflicts).toEqual([]);
    expect(childIds(result.doc, 'row')).toEqual(['price', 'theirsText', 'oursText', 'tagIcon']);
});

test('a node theirs moved among siblings keeps its place next to the nodes ours added', () => {
    const result = mergePen(
        edit(),
        edit(doc => insert(doc, 'row', 2, text('oursText'))),
        edit(doc => insert(doc, 'row', 1, remove(doc, 'price'))),
    );

    expect(result.conflicts).toEqual([]);
    expect(childIds(result.doc, 'row')).toEqual(['tagIcon', 'price', 'oursText']);
});

test('a property changed differently on both sides keeps ours and is reported', () => {
    const result = merge(
        doc => (node(doc, 'row').name = 'Ours'),
        doc => (node(doc, 'row').name = 'Theirs'),
    );

    expect(result.conflicts).toEqual([
        { kind: 'property', node: on('row', 'Ours', SCREEN), key: 'name', base: 'Row', ours: 'Ours', theirs: 'Theirs' },
    ]);
    expect(node(result.doc, 'row').name).toBe('Ours');
});

test('a property changed to the same value on both sides is not a conflict', () => {
    const rename = (doc: PenDocument) => (node(doc, 'row').name = 'Same');

    const result = merge(rename, rename);

    expect(result.conflicts).toEqual([]);
    expect(node(result.doc, 'row').name).toBe('Same');
});

test('overrides changed differently on both sides keep ours, per property and per replacement', () => {
    const result = merge(
        doc => {
            overrides(doc, 'saveButton').label = { content: 'Ours', fill: '$accent' };
            overrides(doc, 'saveButton').icon = { type: 'icon', id: 'oursIcon', icon: 'x' };
        },
        doc => {
            overrides(doc, 'saveButton').label = { content: 'Theirs', fill: '$fg' };
            overrides(doc, 'saveButton').icon = { type: 'icon', id: 'theirsIcon', icon: 'y' };
        },
    );

    const save = on('saveButton', 'Save', SCREEN);
    const expected: PenConflict[] = [
        {
            kind: 'override',
            node: save,
            key: 'descendants["label"].content',
            base: '$ Save',
            ours: 'Ours',
            theirs: 'Theirs',
        },
        {
            kind: 'override',
            node: save,
            key: 'descendants["icon"]',
            base: { type: 'rectangle', id: 'saveDot', width: 8, height: 8, fill: '$accent' },
            ours: { type: 'icon', id: 'oursIcon', icon: 'x' },
            theirs: { type: 'icon', id: 'theirsIcon', icon: 'y' },
        },
    ];
    expect(result.conflicts).toEqual(expected);
    expect(node(result.doc, 'saveButton').descendants).toEqual({
        label: { content: 'Ours', fill: '$fg' },
        icon: { type: 'icon', id: 'oursIcon', icon: 'x' },
    });
});

test('a node deleted on one side and edited under it on the other is kept as edited and reported', () => {
    const result = merge(
        doc => remove(doc, 'row'),
        doc => (node(doc, 'price').content = '$7 off'),
    );

    expect(result.conflicts).toEqual([{ kind: 'delete-edit', node: on('row', 'Row', SCREEN), deletedBy: 'ours' }]);
    expect(childIds(result.doc, 'screen')).toEqual(['row', 'saveButton', 'promoCard']);
    expect(node(result.doc, 'price').content).toBe('$7 off');
    expect(node(result.doc, 'tagIcon').id).toBe('tagIcon');
});

test('a component deleted on one side while the other adds an instance of it is kept and reported', () => {
    const result = merge(
        doc => {
            remove(doc, 'promoCard');
            remove(doc, 'card');
        },
        doc => insert(doc, 'screen', 1, { type: 'ref', id: 'newCard', ref: 'card' }),
    );

    expect(result.conflicts).toEqual([
        { kind: 'delete-edit', node: on('card', 'Card', COMPONENTS), deletedBy: 'ours' },
    ]);
    expect(childIds(result.doc, 'components')).toEqual(['button', 'card']);
    expect(childIds(result.doc, 'card')).toEqual(['body', 'slot']);
    expect(childIds(result.doc, 'screen')).toEqual(['row', 'newCard', 'saveButton']);
});

test('a node moved to different places on both sides stays where ours put it and is reported', () => {
    const result = merge(
        doc => insert(doc, 'screen', 0, remove(doc, 'tagIcon')),
        doc => insert(doc, 'components', 0, remove(doc, 'tagIcon')),
    );

    expect(result.conflicts).toEqual([
        {
            kind: 'move',
            node: on('tagIcon', null, SCREEN),
            key: null,
            base: { parent: 'row', index: 1 },
            ours: { parent: 'screen', index: 0 },
            theirs: { parent: 'components', index: 0 },
        },
    ]);
    expect(childIds(result.doc, 'screen')).toEqual(['tagIcon', 'row', 'saveButton', 'promoCard']);
    expect(childIds(result.doc, 'components')).toEqual(['button', 'card']);
});

test('two nodes each side moved into the other stay where ours put them, without a cycle', () => {
    const result = merge(
        doc => insert(doc, 'card', 0, remove(doc, 'row')),
        doc => insert(doc, 'row', 0, remove(doc, 'card')),
    );

    expect(result.conflicts).toEqual([
        {
            kind: 'move',
            node: on('card', 'Card', COMPONENTS),
            key: null,
            base: { parent: 'components', index: 1 },
            ours: { parent: 'components', index: 1 },
            theirs: { parent: 'row', index: 0 },
        },
    ]);
    expect(childIds(result.doc, 'card')).toEqual(['row', 'body', 'slot']);
    expect(childIds(result.doc, 'row')).toEqual(['price', 'tagIcon']);
});

test('a node added on both sides with the same id and different content keeps ours and is reported', () => {
    const result = merge(
        doc => insert(doc, 'row', 0, text('twin', 'Ours')),
        doc => insert(doc, 'screen', 0, text('twin', 'Theirs')),
    );

    expect(result.conflicts).toEqual([
        {
            kind: 'same-id',
            node: on('twin', null, SCREEN),
            key: null,
            base: undefined,
            ours: text('twin', 'Ours'),
            theirs: text('twin', 'Theirs'),
        },
    ]);
    expect(childIds(result.doc, 'row')).toEqual(['twin', 'price', 'tagIcon']);
    expect(childIds(result.doc, 'screen')).toEqual(['row', 'saveButton', 'promoCard']);
});

test('variables and other top-level keys changed differently on both sides keep ours and are reported', () => {
    const result = merge(
        doc => {
            variables(doc).bg = { type: 'color', value: '#111111' };
            doc.fileToken = 'ours';
        },
        doc => {
            variables(doc).bg = { type: 'color', value: '#222222' };
            doc.fileToken = 'theirs';
        },
    );

    expect(result.conflicts).toEqual([
        {
            kind: 'top-level',
            node: null,
            key: 'variables.bg',
            base: { type: 'color', value: '#0D1117' },
            ours: { type: 'color', value: '#111111' },
            theirs: { type: 'color', value: '#222222' },
        },
        { kind: 'top-level', node: null, key: 'fileToken', base: 'fixture', ours: 'ours', theirs: 'theirs' },
    ]);
    expect(result.doc.fileToken).toBe('ours');
});

/** Changes a document in place. */
type Mutation = (doc: PenDocument) => unknown;

/** Merges a change on each side of the fixture, checking that the result is a valid document. */
function merge(ours: Mutation, theirs: Mutation) {
    const result = mergePen(edit(), edit(ours), edit(theirs));
    expect(checkPen(serializePen(result.doc))).toEqual([]);
    return result;
}

function edit(...mutations: Mutation[]): PenDocument {
    const doc = parsePen(FIXTURE);
    for (const mutation of mutations) {
        mutation(doc);
    }
    return doc;
}

function node(doc: PenDocument, id: string): PenNode {
    const entry = indexPen(doc).get(id);
    if (!entry) {
        throw new Error(`no node ${id}`);
    }
    return entry.node;
}

function childrenOf(doc: PenDocument, parentId: string | null): PenNode[] {
    if (parentId === null) {
        return doc.children;
    }
    const parent = node(doc, parentId);
    parent.children ??= [];
    return parent.children;
}

function childIds(doc: PenDocument, parentId: string | null): string[] {
    return childrenOf(doc, parentId).map(child => child.id);
}

function remove(doc: PenDocument, id: string): PenNode {
    const siblings = childrenOf(doc, indexPen(doc).get(id)?.parentId ?? null);
    const [removed] = siblings.splice(
        siblings.findIndex(child => child.id === id),
        1,
    );
    return removed!;
}

function insert(doc: PenDocument, parentId: string | null, index: number, inserted: PenNode) {
    childrenOf(doc, parentId).splice(index, 0, inserted);
}

function insertKey(target: PenNode, after: string, key: string, value: unknown) {
    const entries = Object.entries(target);
    for (const [entryKey] of entries) {
        delete target[entryKey];
    }
    for (const [entryKey, entryValue] of entries) {
        target[entryKey] = entryValue;
        if (entryKey === after) {
            target[key] = value;
        }
    }
}

function overrides(doc: PenDocument, id: string) {
    const instance = node(doc, id);
    instance.descendants ??= {};
    return instance.descendants;
}

function variables(doc: PenDocument) {
    doc.variables ??= {};
    return doc.variables;
}

function frame(id: string, children?: PenNode[]): PenNode {
    return children ? { type: 'frame', id, children } : { type: 'frame', id };
}

function text(id: string, content = id): PenNode {
    return { type: 'text', id, content };
}

function on(id: string, name: string | null, frameRef: PenConflictNode['frame']): PenConflictNode {
    return { id, name, frame: frameRef };
}
